import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { db } from './db';
import type { Book, Page, Card, ReviewEvent } from './db';

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

  it('TASK-003 AC-2: indexed query returns inserted rows by index value', async () => {
    // Sanity check that an index actually filters, not just that .where() doesn't throw.
    await db.open();
    const bookId = ulid();
    const otherBookId = ulid();
    const matching: Page = {
      id: ulid(),
      bookId,
      title: 'Bronze 1',
      tier: 'bronze',
      createdAt: 1,
      reviewableAt: 100,
      cardIds: [],
    };
    const nonMatching: Page = {
      id: ulid(),
      bookId: otherBookId,
      title: 'Bronze 1',
      tier: 'bronze',
      createdAt: 1,
      reviewableAt: 100,
      cardIds: [],
    };
    await db.pages.bulkPut([matching, nonMatching]);
    const results = await db.pages.where('bookId').equals(bookId).toArray();
    expect(results).toEqual([matching]);
  });
});
