import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
