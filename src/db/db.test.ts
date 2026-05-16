import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Table } from 'dexie';
import { ulid } from 'ulid';
import { db } from './db';
import type { Book, Page, Card, ReviewEvent, Tier } from './db';

/**
 * Proves a Dexie index actually filters rows (not merely that `.where()` resolves).
 * Inserts two rows with distinct index values, queries for the matching one,
 * and asserts exactly that row comes back.
 *
 * Works for both single-field indexes (value is a scalar) and compound indexes
 * (value is a tuple) — Dexie's `where(name).equals(value)` accepts both shapes.
 */
async function assertIndexFilters<TRow extends { id: string }, TValue>(
  table: Table<TRow, string>,
  indexName: string,
  matchingValue: TValue,
  nonMatchingValue: TValue,
  rowFactory: (value: TValue) => TRow,
): Promise<void> {
  const matching = rowFactory(matchingValue);
  const nonMatching = rowFactory(nonMatchingValue);
  await table.bulkPut([matching, nonMatching]);
  const results = await table
    .where(indexName)
    .equals(matchingValue as never)
    .toArray();
  expect(results.map((r) => r.id)).toEqual([matching.id]);
}

// Each test runs against a fresh DB to avoid state leakage. The simplest way is
// to close + delete the singleton DB between tests and let `db.open()` lazily
// re-initialise. `fake-indexeddb/auto` is wired globally in `vitest.setup.ts`.

beforeEach(async () => {
  if (db.isOpen()) {
    db.close();
  }
  await db.delete();
});

afterEach(async () => {
  if (db.isOpen()) {
    db.close();
  }
});

describe('db schema', () => {
  it('TASK-003 AC-1: db.open() resolves without throwing', async () => {
    await expect(db.open()).resolves.toBeDefined();
  });

  it('TASK-003 AC-1: db exports tables books, pages, cards, reviews', async () => {
    await db.open();
    expect(db.books).toBeDefined();
    expect(db.pages).toBeDefined();
    expect(db.cards).toBeDefined();
    expect(db.reviews).toBeDefined();
  });

  describe('TASK-003 AC-2: declared indexes resolve', () => {
    it('books table: primary-key-only, toArray() works on empty table', async () => {
      await db.open();
      await expect(db.books.toArray()).resolves.toEqual([]);
    });

    it('pages.bookId index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.pages.where('bookId').equals('nonexistent').toArray(),
      ).resolves.toEqual([]);
    });

    it('pages.reviewableAt index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.pages.where('reviewableAt').equals(0).toArray(),
      ).resolves.toEqual([]);
    });

    it('pages.[bookId+tier] compound index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.pages.where('[bookId+tier]').equals(['book1', 'bronze']).toArray(),
      ).resolves.toEqual([]);
    });

    it('cards.pageId index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.cards.where('pageId').equals('nonexistent').toArray(),
      ).resolves.toEqual([]);
    });

    it('cards.bookId index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.cards.where('bookId').equals('nonexistent').toArray(),
      ).resolves.toEqual([]);
    });

    it('cards.archivedAt index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.cards.where('archivedAt').equals(0).toArray(),
      ).resolves.toEqual([]);
    });

    it('reviews.cardId index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.reviews.where('cardId').equals('nonexistent').toArray(),
      ).resolves.toEqual([]);
    });

    it('reviews.pageId index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.reviews.where('pageId').equals('nonexistent').toArray(),
      ).resolves.toEqual([]);
    });

    it('reviews.reviewedAt index resolves a where().equals() query', async () => {
      await db.open();
      await expect(
        db.reviews.where('reviewedAt').equals(0).toArray(),
      ).resolves.toEqual([]);
    });
  });

  describe('TASK-003 AC-2: round-trip insert + read on each table', () => {
    it('books: insert and read back a minimal row', async () => {
      await db.open();
      const book: Book = {
        id: ulid(),
        name: 'Spanish',
        sourceLang: 'en',
        targetLang: 'es',
        settings: {
          distillationIntervalDays: 14,
          headlistSize: 25,
          autoDropOnEasy: true,
          autoDropOnModerate: true,
          autoDropOnHard: false,
        },
        createdAt: 1_700_000_000_000,
      };
      await db.books.put(book);
      const fetched = await db.books.get(book.id);
      expect(fetched).toEqual(book);
    });

    it('pages: insert and read back a minimal row', async () => {
      await db.open();
      const page: Page = {
        id: ulid(),
        bookId: ulid(),
        title: 'Bronze 1',
        tier: 'bronze',
        createdAt: 1_700_000_000_000,
        reviewableAt: 1_700_000_000_000 + 14 * 86_400_000,
        cardIds: [],
      };
      await db.pages.put(page);
      const fetched = await db.pages.get(page.id);
      expect(fetched).toEqual(page);
    });

    it('cards: insert and read back a minimal row', async () => {
      await db.open();
      const card: Card = {
        id: ulid(),
        bookId: ulid(),
        pageId: ulid(),
        source: 'hola',
        target: 'hello',
        createdAt: 1_700_000_000_000,
      };
      await db.cards.put(card);
      const fetched = await db.cards.get(card.id);
      expect(fetched).toEqual(card);
    });

    it('reviews: insert and read back a minimal row', async () => {
      await db.open();
      const event: ReviewEvent = {
        id: ulid(),
        cardId: ulid(),
        pageId: ulid(),
        rating: 'easy',
        reviewedAt: 1_700_000_000_000,
      };
      await db.reviews.put(event);
      const fetched = await db.reviews.get(event.id);
      expect(fetched).toEqual(event);
    });
  });

  describe('TASK-003 AC-2 (filter): each declared index filters rows by value', () => {
    it('pages.bookId filters by bookId', async () => {
      await db.open();
      const matchId = ulid();
      const otherId = ulid();
      await assertIndexFilters<Page, string>(
        db.pages,
        'bookId',
        matchId,
        otherId,
        (bookId) => ({
          id: ulid(),
          bookId,
          title: 'Bronze 1',
          tier: 'bronze',
          createdAt: 1,
          reviewableAt: 100,
          cardIds: [],
        }),
      );
    });

    it('pages.reviewableAt filters by reviewableAt', async () => {
      await db.open();
      await assertIndexFilters<Page, number>(
        db.pages,
        'reviewableAt',
        100,
        200,
        (reviewableAt) => ({
          id: ulid(),
          bookId: ulid(),
          title: 'Bronze 1',
          tier: 'bronze',
          createdAt: 1,
          reviewableAt,
          cardIds: [],
        }),
      );
    });

    it('pages.[bookId+tier] compound index filters by both fields', async () => {
      await db.open();
      const bookId = ulid();
      // Differentiate on the tier component to prove the compound key is honoured,
      // not just the leading bookId field.
      await assertIndexFilters<Page, [string, Tier]>(
        db.pages,
        '[bookId+tier]',
        [bookId, 'bronze'],
        [bookId, 'silver'],
        ([bId, tier]) => ({
          id: ulid(),
          bookId: bId,
          title: 'A page',
          tier,
          createdAt: 1,
          reviewableAt: 100,
          cardIds: [],
        }),
      );
    });

    it('cards.pageId filters by pageId', async () => {
      await db.open();
      const matchId = ulid();
      const otherId = ulid();
      await assertIndexFilters<Card, string>(
        db.cards,
        'pageId',
        matchId,
        otherId,
        (pageId) => ({
          id: ulid(),
          bookId: ulid(),
          pageId,
          source: 'hola',
          target: 'hello',
          createdAt: 1,
        }),
      );
    });

    it('cards.bookId filters by bookId', async () => {
      await db.open();
      const matchId = ulid();
      const otherId = ulid();
      await assertIndexFilters<Card, string>(
        db.cards,
        'bookId',
        matchId,
        otherId,
        (bookId) => ({
          id: ulid(),
          bookId,
          pageId: ulid(),
          source: 'hola',
          target: 'hello',
          createdAt: 1,
        }),
      );
    });

    it('cards.archivedAt filters by archivedAt', async () => {
      await db.open();
      await assertIndexFilters<Card, number>(
        db.cards,
        'archivedAt',
        1_700_000_000_000,
        1_700_000_001_000,
        (archivedAt) => ({
          id: ulid(),
          bookId: ulid(),
          pageId: ulid(),
          source: 'hola',
          target: 'hello',
          createdAt: 1,
          archivedAt,
        }),
      );
    });

    it('reviews.cardId filters by cardId', async () => {
      await db.open();
      const matchId = ulid();
      const otherId = ulid();
      await assertIndexFilters<ReviewEvent, string>(
        db.reviews,
        'cardId',
        matchId,
        otherId,
        (cardId) => ({
          id: ulid(),
          cardId,
          pageId: ulid(),
          rating: 'easy',
          reviewedAt: 1_700_000_000_000,
        }),
      );
    });

    it('reviews.pageId filters by pageId', async () => {
      await db.open();
      const matchId = ulid();
      const otherId = ulid();
      await assertIndexFilters<ReviewEvent, string>(
        db.reviews,
        'pageId',
        matchId,
        otherId,
        (pageId) => ({
          id: ulid(),
          cardId: ulid(),
          pageId,
          rating: 'easy',
          reviewedAt: 1_700_000_000_000,
        }),
      );
    });

    it('reviews.reviewedAt filters by reviewedAt', async () => {
      await db.open();
      await assertIndexFilters<ReviewEvent, number>(
        db.reviews,
        'reviewedAt',
        1_700_000_000_000,
        1_700_000_001_000,
        (reviewedAt) => ({
          id: ulid(),
          cardId: ulid(),
          pageId: ulid(),
          rating: 'easy',
          reviewedAt,
        }),
      );
    });
  });
});
