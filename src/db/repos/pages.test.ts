import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { db } from '../db';
import type { Card, Page } from '../db';
import { finalizePage } from '../../lib/distillation';
import * as pages from './pages';

// --- Factories ----------------------------------------------------------------

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: ulid(),
    bookId: ulid(),
    title: 'Bronze 1',
    tier: 'bronze',
    createdAt: 1_700_000_000_000,
    reviewableAt: 1_700_000_000_000 + 14 * 86_400_000,
    cardIds: [],
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: ulid(),
    bookId: ulid(),
    pageId: ulid(),
    source: 'hola',
    target: 'hello',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(async () => {
  if (db.isOpen()) {
    db.close();
  }
  await db.delete();
  await db.open();
});

afterEach(async () => {
  if (db.isOpen()) {
    db.close();
  }
});

// --- AC-2: basic CRUD + listByBook + listDue ----------------------------------

describe('pages repo — CRUD and queries (TASK-005 AC-2)', () => {
  it('TASK-005 AC-2: pages.create writes a row that pages.get can read back', async () => {
    const page = makePage({ title: 'My Bronze List' });
    await pages.create(page);

    const fetched = await pages.get(page.id);
    expect(fetched).toEqual(page);
  });

  it('TASK-005 AC-2: pages.get returns undefined for a missing id', async () => {
    expect(await pages.get('nonexistent')).toBeUndefined();
  });

  it('TASK-005 AC-2: pages.listByBook returns only pages in the requested book', async () => {
    const bookA = ulid();
    const bookB = ulid();
    const a1 = makePage({ bookId: bookA, title: 'A1' });
    const a2 = makePage({ bookId: bookA, title: 'A2' });
    const b1 = makePage({ bookId: bookB, title: 'B1' });
    await pages.create(a1);
    await pages.create(a2);
    await pages.create(b1);

    const inA = await pages.listByBook(bookA);
    const idsInA = inA.map((p) => p.id).sort();
    expect(idsInA).toEqual([a1.id, a2.id].sort());

    const inB = await pages.listByBook(bookB);
    expect(inB.map((p) => p.id)).toEqual([b1.id]);
  });

  it('TASK-005 AC-2: pages.listByBook returns [] for a book with no pages', async () => {
    // Seed pages in another book so the table is not empty — otherwise the
    // assertion would pass even if listByBook ignored its argument.
    await pages.create(makePage({ bookId: ulid() }));
    const out = await pages.listByBook(ulid());
    expect(out).toEqual([]);
  });

  // --- AC-2: listDue — three filter dimensions, each independently verified ---

  it('TASK-005 AC-2: pages.listDue includes pages with reviewableAt <= now and no reviewedAt', async () => {
    const now = 2_000_000_000_000;
    const due = makePage({
      title: 'due',
      reviewableAt: now - 1, // strictly past
    });
    await pages.create(due);

    const result = await pages.listDue(now);
    expect(result.map((p) => p.id)).toEqual([due.id]);
  });

  it('TASK-005 AC-2: pages.listDue includes pages whose reviewableAt equals now (inclusive)', async () => {
    const now = 2_000_000_000_000;
    const onTheDot = makePage({ reviewableAt: now });
    await pages.create(onTheDot);

    const result = await pages.listDue(now);
    expect(result.map((p) => p.id)).toEqual([onTheDot.id]);
  });

  it('TASK-005 AC-2: pages.listDue excludes Gold pages (reviewableAt === null)', async () => {
    const now = 2_000_000_000_000;
    const gold = makePage({
      title: 'gold',
      tier: 'gold',
      reviewableAt: null,
    });
    const due = makePage({
      title: 'due',
      reviewableAt: now - 1,
    });
    await pages.create(gold);
    await pages.create(due);

    const result = await pages.listDue(now);
    expect(result.map((p) => p.id)).toEqual([due.id]);
  });

  it('TASK-005 AC-2: pages.listDue excludes pages where reviewableAt > now (future)', async () => {
    const now = 2_000_000_000_000;
    const future = makePage({
      title: 'future',
      reviewableAt: now + 1,
    });
    const due = makePage({
      title: 'due',
      reviewableAt: now - 1,
    });
    await pages.create(future);
    await pages.create(due);

    const result = await pages.listDue(now);
    expect(result.map((p) => p.id)).toEqual([due.id]);
  });

  it('TASK-005 AC-2: pages.listDue excludes pages that already have reviewedAt set', async () => {
    const now = 2_000_000_000_000;
    const alreadyReviewed = makePage({
      title: 'reviewed',
      reviewableAt: now - 1000,
      reviewedAt: now - 500,
    });
    const due = makePage({
      title: 'due',
      reviewableAt: now - 1,
    });
    await pages.create(alreadyReviewed);
    await pages.create(due);

    const result = await pages.listDue(now);
    expect(result.map((p) => p.id)).toEqual([due.id]);
  });

  it('TASK-005 AC-2: pages.listDue returns all matching pages in one mixed fixture', async () => {
    const now = 2_000_000_000_000;
    // Seed every category and assert only the due ones come back.
    const due1 = makePage({ title: 'due1', reviewableAt: now - 100 });
    const due2 = makePage({ title: 'due2', reviewableAt: now });
    const future = makePage({ title: 'future', reviewableAt: now + 100 });
    const gold = makePage({
      title: 'gold',
      tier: 'gold',
      reviewableAt: null,
    });
    const reviewed = makePage({
      title: 'reviewed',
      reviewableAt: now - 200,
      reviewedAt: now - 50,
    });
    await pages.create(due1);
    await pages.create(due2);
    await pages.create(future);
    await pages.create(gold);
    await pages.create(reviewed);

    const result = await pages.listDue(now);
    const ids = result.map((p) => p.id).sort();
    expect(ids).toEqual([due1.id, due2.id].sort());
  });
});

// --- AC-3: pages.finalize transactional behaviour -----------------------------

describe('pages.finalize (TASK-005 AC-3)', () => {
  function seedParentWithCards(bookId: string): {
    parent: Page;
    parentCards: Card[];
  } {
    const parentCards = [
      makeCard({ bookId, pageId: 'placeholder', source: 'uno', target: 'one' }),
      makeCard({ bookId, pageId: 'placeholder', source: 'dos', target: 'two' }),
      makeCard({
        bookId,
        pageId: 'placeholder',
        source: 'tres',
        target: 'three',
      }),
    ];
    const parent = makePage({
      bookId,
      title: 'Bronze 1',
      tier: 'bronze',
      cardIds: parentCards.map((c) => c.id),
    });
    // Fix the cards' pageId now that the parent id is known.
    for (const c of parentCards) {
      c.pageId = parent.id;
    }
    return { parent, parentCards };
  }

  it('TASK-005 AC-3: writes childPage, inserts newCards, archives parent cards, sets parent.childPageId+reviewedAt', async () => {
    const now = 2_500_000_000_000;
    const bookId = ulid();
    const { parent, parentCards } = seedParentWithCards(bookId);

    await pages.create(parent);
    await db.cards.bulkPut(parentCards);

    const plan = finalizePage({
      parent,
      builderEntries: [
        { source: 'one (new)', target: 'one-target', parentIds: [parentCards[0]!.id] },
        { source: 'two (new)', target: 'two-target', parentIds: [parentCards[1]!.id, parentCards[2]!.id] },
      ],
      now,
      intervalDays: 14,
    });

    await pages.finalize(plan);

    // 1. childPage was written.
    const childFetched = await db.pages.get(plan.childPage.id);
    expect(childFetched).toEqual(plan.childPage);

    // 2. Each newCard was inserted.
    for (const newCard of plan.newCards) {
      const fetched = await db.cards.get(newCard.id);
      expect(fetched).toEqual(newCard);
    }

    // 3. Each parent card row now has archivedAt set to a positive number.
    for (const archivedId of plan.archivedCardIds) {
      const archived = await db.cards.get(archivedId);
      expect(archived).toBeDefined();
      expect(typeof archived?.archivedAt).toBe('number');
      expect(archived?.archivedAt).toBeGreaterThan(0);
    }

    // 4. Parent page now links to child + has reviewedAt set.
    const parentFetched = await db.pages.get(parent.id);
    expect(parentFetched?.childPageId).toBe(plan.childPage.id);
    expect(typeof parentFetched?.reviewedAt).toBe('number');
    expect(parentFetched?.reviewedAt).toBeGreaterThan(0);
  });

  it('TASK-005 AC-3: rolls back entirely on collision — parent untouched, no new cards, no archive flags', async () => {
    const now = 2_500_000_000_000;
    const bookId = ulid();
    const { parent, parentCards } = seedParentWithCards(bookId);

    await pages.create(parent);
    await db.cards.bulkPut(parentCards);

    const plan = finalizePage({
      parent,
      builderEntries: [
        { source: 's1', target: 't1', parentIds: [parentCards[0]!.id] },
        { source: 's2', target: 't2', parentIds: [] },
      ],
      now,
      intervalDays: 14,
    });

    // Force a collision: pre-insert a Page row with the SAME id as the planned
    // childPage. A correct implementation uses `.add()` (strict insert) for the
    // child Page, so this collision must reject the whole transaction.
    const collidingPage = makePage({
      id: plan.childPage.id,
      bookId,
      title: 'pre-existing',
      tier: 'silver',
    });
    await db.pages.put(collidingPage);

    // Snapshot pre-state to assert nothing else changes.
    const parentBefore = await db.pages.get(parent.id);
    const parentCardsBefore = await Promise.all(
      parentCards.map((c) => db.cards.get(c.id)),
    );

    // The call must throw / reject.
    await expect(pages.finalize(plan)).rejects.toBeDefined();

    // Parent page must be byte-for-byte unchanged.
    const parentAfter = await db.pages.get(parent.id);
    expect(parentAfter).toEqual(parentBefore);
    expect(parentAfter?.reviewedAt).toBeUndefined();
    expect(parentAfter?.childPageId).toBeUndefined();

    // Parent cards must be byte-for-byte unchanged — no archivedAt mutation.
    const parentCardsAfter = await Promise.all(
      parentCards.map((c) => db.cards.get(c.id)),
    );
    expect(parentCardsAfter).toEqual(parentCardsBefore);
    for (const c of parentCardsAfter) {
      expect(c?.archivedAt).toBeUndefined();
    }

    // None of the new cards may have landed.
    for (const newCard of plan.newCards) {
      expect(await db.cards.get(newCard.id)).toBeUndefined();
    }

    // The colliding pre-existing page row is still there with its original content.
    const collidingAfter = await db.pages.get(plan.childPage.id);
    expect(collidingAfter).toEqual(collidingPage);
  });
});

// ---------------------------------------------------------------------------
// TASK-011 AC-2: pages.update — unconditional partial update.
//
// Distinguishes itself from cards.update (which throws when the parent page is
// reviewed). pages.update is the route-layer mechanism for keeping
// Page.cardIds in sync after a Card add/remove on an unreviewed Page. ADR-015.
//
// Each test seeds via pages.create (positive presence), calls pages.update,
// reads back via pages.get, and asserts the persisted row. The lock-bypass
// test additionally proves the absence of the cards.update lock check.
// ---------------------------------------------------------------------------

describe('TASK-011 AC-2: pages.update — partial update persists changes', () => {
  it('TASK-011 AC-2: pages.update with { cardIds: ["c1","c2"] } persists the array', async () => {
    const page = makePage({ cardIds: [] });
    await pages.create(page);

    await pages.update(page.id, { cardIds: ['c1', 'c2'] });

    const fetched = await pages.get(page.id);
    expect(fetched).toBeDefined();
    // Deep-equal — kills "passes a [c1] singleton" or "appends to existing".
    expect(fetched?.cardIds).toEqual(['c1', 'c2']);
    // Untouched fields remain.
    expect(fetched?.id).toBe(page.id);
    expect(fetched?.bookId).toBe(page.bookId);
    expect(fetched?.title).toBe(page.title);
  });

  it('TASK-011 AC-2: pages.update with { reviewedAt: 12345 } persists the value', async () => {
    const page = makePage();
    await pages.create(page);

    await pages.update(page.id, { reviewedAt: 12345 });

    const fetched = await pages.get(page.id);
    expect(fetched?.reviewedAt).toBe(12345);
  });

  it('TASK-011 AC-2: pages.update preserves untouched fields (only changes are merged)', async () => {
    // kills: a buggy implementation that calls db.pages.put(changes), wiping
    // every other column. Dexie's table.update is the correct primitive.
    const page = makePage({
      title: 'Bronze 7',
      cardIds: ['a', 'b'],
      reviewableAt: 9_999_999_999,
    });
    await pages.create(page);

    await pages.update(page.id, { cardIds: ['a', 'b', 'c'] });

    const fetched = await pages.get(page.id);
    expect(fetched?.title).toBe('Bronze 7');
    expect(fetched?.reviewableAt).toBe(9_999_999_999);
    expect(fetched?.cardIds).toEqual(['a', 'b', 'c']);
  });

  it('TASK-011 AC-2: pages.update on a reviewed Page resolves (no lock — unlike cards.update)', async () => {
    // The crucial discriminator from cards.update. The locked-Page invariant
    // is enforced at the UI / route layer (ListDetail hides affordances); the
    // repo function itself MUST NOT throw. Picking cardIds as the field
    // (it's a real Page field, unlike a hypothetical lastNotifiedAt which
    // DOES exist on the type — but we use cardIds anyway because it's the
    // realistic call site).
    const reviewedPage = makePage({
      reviewedAt: 1_700_000_000_000,
      cardIds: ['existing'],
    });
    await pages.create(reviewedPage);

    // Must resolve, not reject. If the implementer ports the cards.update
    // assertPageUnlocked guard into pages.update, this rejects and the test
    // fails — exactly the contract from ADR-015.
    await expect(
      pages.update(reviewedPage.id, { cardIds: ['existing', 'late-add'] }),
    ).resolves.toBeUndefined();

    const fetched = await pages.get(reviewedPage.id);
    expect(fetched?.cardIds).toEqual(['existing', 'late-add']);
    // And reviewedAt was not clobbered.
    expect(fetched?.reviewedAt).toBe(1_700_000_000_000);
  });

  it('TASK-011 AC-2: pages.update on a reviewed Page also accepts lastNotifiedAt updates (covers reminder path)', async () => {
    // lastNotifiedAt is a defined optional field on Page (db.ts), so a
    // future reminders flow would call pages.update with it. The lock-bypass
    // must allow this — asserted with discriminating data (the field was
    // unset, the update sets it).
    const reviewedPage = makePage({
      reviewedAt: 1_700_000_000_000,
    });
    await pages.create(reviewedPage);

    await pages.update(reviewedPage.id, { lastNotifiedAt: 999 });

    const fetched = await pages.get(reviewedPage.id);
    expect(fetched?.lastNotifiedAt).toBe(999);
  });
});
