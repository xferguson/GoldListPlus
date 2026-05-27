import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ulid } from 'ulid';
import { db } from '../db';
import type { Card, Page } from '../db';
import * as cards from './cards';
import { MS_PER_DAY } from '../../lib/time';

// --- Factories ----------------------------------------------------------------

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: ulid(),
    bookId: ulid(),
    title: 'Bronze 1',
    tier: 'bronze',
    createdAt: 1_700_000_000_000,
    reviewableAt: 1_700_000_000_000 + 14 * MS_PER_DAY,
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
  vi.restoreAllMocks();
  if (db.isOpen()) {
    db.close();
  }
});

// --- AC-4: CRUD ---------------------------------------------------------------

describe('cards repo — CRUD (TASK-005 AC-4)', () => {
  it('TASK-005 AC-4: cards.create writes a row that cards.get can read back', async () => {
    const page = makePage();
    await db.pages.put(page);
    const card = makeCard({ pageId: page.id, source: 'hola', target: 'hello' });
    await cards.create(card);

    expect(await cards.get(card.id)).toEqual(card);
  });

  it('TASK-005 AC-4: cards.get returns undefined for a missing id', async () => {
    expect(await cards.get('nonexistent')).toBeUndefined();
  });

  it('TASK-005 AC-4: cards.listByPage returns only cards on the requested page', async () => {
    const pageA = makePage({ title: 'A' });
    const pageB = makePage({ title: 'B' });
    await db.pages.bulkPut([pageA, pageB]);

    const a1 = makeCard({ pageId: pageA.id, source: 'a1' });
    const a2 = makeCard({ pageId: pageA.id, source: 'a2' });
    const b1 = makeCard({ pageId: pageB.id, source: 'b1' });
    await cards.create(a1);
    await cards.create(a2);
    await cards.create(b1);

    const inA = await cards.listByPage(pageA.id);
    const idsInA = inA.map((c) => c.id).sort();
    expect(idsInA).toEqual([a1.id, a2.id].sort());

    const inB = await cards.listByPage(pageB.id);
    expect(inB.map((c) => c.id)).toEqual([b1.id]);
  });

  it('TASK-005 AC-4: cards.listByPage returns [] for a page with no cards', async () => {
    // Seed cards on a different page so the table is not empty.
    const otherPage = makePage();
    await db.pages.put(otherPage);
    await cards.create(makeCard({ pageId: otherPage.id }));

    const target = makePage();
    await db.pages.put(target);
    expect(await cards.listByPage(target.id)).toEqual([]);
  });
});

// --- AC-4: update / remove on unlocked pages ---------------------------------

describe('cards repo — mutation on unlocked pages (TASK-005 AC-4)', () => {
  it('TASK-005 AC-4: cards.update mutates only listed fields on a card whose page is unlocked', async () => {
    const page = makePage(); // reviewedAt undefined → unlocked
    await db.pages.put(page);
    const card = makeCard({
      pageId: page.id,
      source: 'hola',
      target: 'hello',
      createdAt: 1_700_000_000_000,
    });
    await cards.create(card);

    await cards.update(card.id, { target: 'hi' });

    const fetched = await cards.get(card.id);
    expect(fetched).toBeDefined();
    expect(fetched?.target).toBe('hi');
    // Unrelated fields preserved.
    expect(fetched?.source).toBe('hola');
    expect(fetched?.pageId).toBe(page.id);
    expect(fetched?.bookId).toBe(card.bookId);
    expect(fetched?.createdAt).toBe(1_700_000_000_000);
  });

  it('TASK-005 AC-4: cards.remove deletes a card whose page is unlocked', async () => {
    const page = makePage();
    await db.pages.put(page);
    const card = makeCard({ pageId: page.id });
    await cards.create(card);

    await cards.remove(card.id);

    expect(await cards.get(card.id)).toBeUndefined();
  });
});

// --- AC-4: locked-page guard --------------------------------------------------

describe('cards repo — locked page guard (TASK-005 AC-4)', () => {
  it('TASK-005 AC-4: cards.update throws when the parent page has reviewedAt set, mentioning "locked"', async () => {
    const lockedPage = makePage({ reviewedAt: 1_700_000_500_000 });
    await db.pages.put(lockedPage);
    const card = makeCard({
      pageId: lockedPage.id,
      source: 'hola',
      target: 'hello',
    });
    await cards.create(card);

    await expect(
      cards.update(card.id, { target: 'goodbye' }),
    ).rejects.toThrow(/locked/i);
  });

  it('TASK-005 AC-4: cards.update does NOT mutate the row when the page is locked', async () => {
    const lockedPage = makePage({ reviewedAt: 1_700_000_500_000 });
    await db.pages.put(lockedPage);
    const card = makeCard({
      pageId: lockedPage.id,
      source: 'hola',
      target: 'hello',
    });
    await cards.create(card);

    await expect(
      cards.update(card.id, { target: 'goodbye' }),
    ).rejects.toBeDefined();

    const after = await cards.get(card.id);
    expect(after).toEqual(card); // no partial mutation
  });

  it('TASK-005 AC-4: cards.remove throws when the parent page has reviewedAt set, mentioning "locked"', async () => {
    const lockedPage = makePage({ reviewedAt: 1_700_000_500_000 });
    await db.pages.put(lockedPage);
    const card = makeCard({ pageId: lockedPage.id });
    await cards.create(card);

    await expect(cards.remove(card.id)).rejects.toThrow(/locked/i);
  });

  it('TASK-005 AC-4: cards.remove does NOT delete the row when the page is locked', async () => {
    const lockedPage = makePage({ reviewedAt: 1_700_000_500_000 });
    await db.pages.put(lockedPage);
    const card = makeCard({ pageId: lockedPage.id });
    await cards.create(card);

    await expect(cards.remove(card.id)).rejects.toBeDefined();

    expect(await cards.get(card.id)).toEqual(card);
  });
});

// =============================================================================
// CHORE-005 — Atomic 2-write `cards.appendToPage` / `cards.detachFromPage`
// =============================================================================
//
// The new functions wrap the existing two-step sequence (cards.add + pages.update)
// inside a single `db.transaction('rw', [db.pages, db.cards], …)` along with a
// locked-page check. Tests assert: (a) happy-path round-trip, (b) ordering /
// preservation of prev cardIds, (c) rollback under partial failure, (d) lock
// check still enforced, (e) round-trip mutation trap (drop the pages.update call).
// =============================================================================

// --- CHORE-005 AC-1: appendToPage happy path --------------------------------

describe('cards.appendToPage — happy path (CHORE-005 AC-1)', () => {
  it('CHORE-005 AC-1: appendToPage writes the card and updates Page.cardIds in one round-trip', async () => {
    const page = makePage({ cardIds: [] });
    await db.pages.put(page);
    const card = makeCard({ pageId: page.id, source: 'hola', target: 'hello' });

    await cards.appendToPage(page.id, card);

    // Card row was written.
    expect(await cards.get(card.id)).toEqual(card);
    // Page.cardIds was extended with the new id.
    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    // kills: dropping the pages.update call (cardIds would stay []).
    expect(after!.cardIds).toEqual([card.id]);
  });

  it('CHORE-005 AC-1: appendToPage preserves prev cardIds and APPENDS the new id (order matters)', async () => {
    const first = makeCard({ id: 'first-card', source: 'one', target: 'uno' });
    const page = makePage({ cardIds: [first.id] });
    await db.pages.put(page);
    await db.cards.put({ ...first, pageId: page.id });

    const second = makeCard({ id: 'second-card', source: 'two', target: 'dos', pageId: page.id });
    await cards.appendToPage(page.id, second);

    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    // kills: [second.id, first.id] (prepend), [second.id] (overwrite),
    // [first.id] (no-op).
    expect(after!.cardIds).toEqual([first.id, second.id]);

    // Both cards present.
    expect(await cards.get(first.id)).toBeDefined();
    expect(await cards.get(second.id)).toBeDefined();
  });

  it('CHORE-005 AC-1: appendToPage handles a third call (chained appends preserve order)', async () => {
    const page = makePage({ cardIds: [] });
    await db.pages.put(page);
    const a = makeCard({ id: 'a', pageId: page.id, source: 'a' });
    const b = makeCard({ id: 'b', pageId: page.id, source: 'b' });
    const c = makeCard({ id: 'c', pageId: page.id, source: 'c' });

    await cards.appendToPage(page.id, a);
    await cards.appendToPage(page.id, b);
    await cards.appendToPage(page.id, c);

    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    expect(after!.cardIds).toEqual(['a', 'b', 'c']);
  });
});

// --- CHORE-005 AC-2: detachFromPage happy path ------------------------------

describe('cards.detachFromPage — happy path (CHORE-005 AC-2)', () => {
  it('CHORE-005 AC-2: detachFromPage deletes the card row and removes the id from Page.cardIds', async () => {
    const first = makeCard({ id: 'first-card' });
    const second = makeCard({ id: 'second-card' });
    const page = makePage({ cardIds: [first.id, second.id] });
    await db.pages.put(page);
    await db.cards.bulkPut([
      { ...first, pageId: page.id },
      { ...second, pageId: page.id },
    ]);

    await cards.detachFromPage(page.id, second.id);

    // Detached card is gone.
    expect(await cards.get(second.id)).toBeUndefined();
    // kills: cards.delete dropped (second would still be present).

    // Page.cardIds has only the survivor.
    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    // kills: filter inverted (.filter(id => id === cardId)) — would return [second.id].
    // kills: cardIds unchanged (no update call).
    // kills: cardIds emptied (.filter(() => false)).
    expect(after!.cardIds).toEqual([first.id]);

    // First card untouched.
    expect(await cards.get(first.id)).toBeDefined();
  });

  it('CHORE-005 AC-2: detachFromPage on a single-card page leaves cardIds === []', async () => {
    const only = makeCard({ id: 'only' });
    const page = makePage({ cardIds: [only.id] });
    await db.pages.put(page);
    await db.cards.put({ ...only, pageId: page.id });

    await cards.detachFromPage(page.id, only.id);

    expect(await cards.get(only.id)).toBeUndefined();
    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    expect(after!.cardIds).toEqual([]);
  });

  it('CHORE-005 AC-2: detachFromPage detaching the middle of three preserves outer order', async () => {
    const a = makeCard({ id: 'a' });
    const b = makeCard({ id: 'b' });
    const c = makeCard({ id: 'c' });
    const page = makePage({ cardIds: [a.id, b.id, c.id] });
    await db.pages.put(page);
    await db.cards.bulkPut([
      { ...a, pageId: page.id },
      { ...b, pageId: page.id },
      { ...c, pageId: page.id },
    ]);

    await cards.detachFromPage(page.id, b.id);

    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    // kills: filter that re-orders or drops the wrong id.
    expect(after!.cardIds).toEqual(['a', 'c']);
    expect(await cards.get('b')).toBeUndefined();
    expect(await cards.get('a')).toBeDefined();
    expect(await cards.get('c')).toBeDefined();
  });
});

// --- CHORE-005 AC-4: rollback when pages.update rejects mid-tx --------------

describe('cards.appendToPage — rollback on partial failure (CHORE-005 AC-4)', () => {
  it('CHORE-005 AC-4: when db.pages.update rejects, appendToPage rejects and the new card is NOT persisted (rollback)', async () => {
    const existing = makeCard({ id: 'existing' });
    const page = makePage({ cardIds: [existing.id] });
    await db.pages.put(page);
    await db.cards.put({ ...existing, pageId: page.id });

    // Capture pre-state for comparison after the failed call.
    const cardCountBefore = (await db.cards.toArray()).length;

    vi.spyOn(db.pages, 'update').mockRejectedValueOnce(new Error('boom'));

    const newCard = makeCard({ id: 'new-card', pageId: page.id, source: 'new' });
    await expect(cards.appendToPage(page.id, newCard)).rejects.toThrow(/boom/);

    // kills: removing the `db.transaction(...)` wrap — without it, cards.add
    // resolves successfully before pages.update rejects, leaving the new card
    // in the DB with no entry in Page.cardIds (orphaned write).
    const allCards = await db.cards.toArray();
    expect(allCards.length).toBe(cardCountBefore);
    expect(allCards.find((c) => c.id === newCard.id)).toBeUndefined();

    // Page.cardIds unchanged.
    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    expect(after!.cardIds).toEqual([existing.id]);
  });
});

describe('cards.detachFromPage — rollback on partial failure (CHORE-005 AC-4)', () => {
  it('CHORE-005 AC-4: when db.pages.update rejects, detachFromPage rejects and the card row is NOT deleted (rollback)', async () => {
    const target = makeCard({ id: 'target' });
    const page = makePage({ cardIds: [target.id] });
    await db.pages.put(page);
    await db.cards.put({ ...target, pageId: page.id });

    vi.spyOn(db.pages, 'update').mockRejectedValueOnce(new Error('boom'));

    await expect(cards.detachFromPage(page.id, target.id)).rejects.toThrow(/boom/);

    // kills: removing the `db.transaction(...)` wrap — without it, cards.delete
    // resolves first, leaving the row gone from cards while the id is still
    // listed in Page.cardIds (dangling reference).
    expect(await cards.get(target.id)).toBeDefined();
    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    expect(after!.cardIds).toEqual([target.id]);
  });
});

// --- CHORE-005 AC-6: lock-check (page.reviewedAt set) -----------------------

describe('cards.appendToPage — locked-page guard (CHORE-005 AC-6)', () => {
  it('CHORE-005 AC-6: appendToPage to a locked page rejects with /locked/i, mentioning the lock', async () => {
    const lockedPage = makePage({ reviewedAt: 1_700_000_500_000, cardIds: [] });
    await db.pages.put(lockedPage);
    const newCard = makeCard({ id: 'new-card', pageId: lockedPage.id });

    await expect(cards.appendToPage(lockedPage.id, newCard)).rejects.toThrow(/locked/i);
  });

  it('CHORE-005 AC-6: appendToPage to a locked page does NOT write the card or mutate cardIds', async () => {
    const lockedPage = makePage({ reviewedAt: 1_700_000_500_000, cardIds: [] });
    await db.pages.put(lockedPage);
    const newCard = makeCard({ id: 'new-card', pageId: lockedPage.id });

    await expect(cards.appendToPage(lockedPage.id, newCard)).rejects.toBeDefined();

    // kills: removing the lock check inside the transaction (the card would
    // be inserted and Page.cardIds extended despite the page being locked).
    expect(await cards.get(newCard.id)).toBeUndefined();
    const after = await db.pages.get(lockedPage.id);
    expect(after).toBeDefined();
    expect(after!.cardIds).toEqual([]);
  });
});

describe('cards.detachFromPage — locked-page guard (CHORE-005 AC-6)', () => {
  it('CHORE-005 AC-6: detachFromPage from a locked page rejects with /locked/i', async () => {
    const existing = makeCard({ id: 'existing' });
    const lockedPage = makePage({
      reviewedAt: 1_700_000_500_000,
      cardIds: [existing.id],
    });
    await db.pages.put(lockedPage);
    await db.cards.put({ ...existing, pageId: lockedPage.id });

    await expect(cards.detachFromPage(lockedPage.id, existing.id)).rejects.toThrow(/locked/i);
  });

  it('CHORE-005 AC-6: detachFromPage from a locked page does NOT delete the card or mutate cardIds', async () => {
    const existing = makeCard({ id: 'existing' });
    const lockedPage = makePage({
      reviewedAt: 1_700_000_500_000,
      cardIds: [existing.id],
    });
    await db.pages.put(lockedPage);
    await db.cards.put({ ...existing, pageId: lockedPage.id });

    await expect(cards.detachFromPage(lockedPage.id, existing.id)).rejects.toBeDefined();

    // kills: removing the lock check (the card would be deleted and cardIds
    // would be emptied despite the page being locked).
    expect(await cards.get(existing.id)).toBeDefined();
    const after = await db.pages.get(lockedPage.id);
    expect(after).toBeDefined();
    expect(after!.cardIds).toEqual([existing.id]);
  });
});

// --- CHORE-005 AC-8: mutation trap — explicit round-trip naming -------------
// AC-8 (from TASKS.md): "dropping the db.pages.update call from appendToPage
// (so only the card is written) causes the round-trip test to fail."
// This test names the trap explicitly so a regression has a diagnostic name.

describe('cards.appendToPage — round-trip mutation trap (CHORE-005 AC-8)', () => {
  it('CHORE-005 AC-8: after appendToPage, pages.get(pageId).cardIds includes the new id (kills dropped pages.update)', async () => {
    const page = makePage({ cardIds: [] });
    await db.pages.put(page);
    const card = makeCard({ id: 'trap-card', pageId: page.id });

    await cards.appendToPage(page.id, card);

    const after = await db.pages.get(page.id);
    expect(after).toBeDefined();
    // kills: dropping `db.pages.update(pageId, {cardIds: [...prev, card.id]})`.
    expect(after!.cardIds).toContain('trap-card');
  });
});
