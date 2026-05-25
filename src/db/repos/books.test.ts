import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { db } from '../db';
import type {
  Book,
  BookSettings,
  Card,
  Page,
  ReviewEvent,
} from '../db';
import * as books from './books';
import { MS_PER_DAY } from '../../lib/time';

// --- Factories (inline; do not extract — premature). --------------------------

const defaultSettings: BookSettings = {
  distillationIntervalDays: 14,
  headlistSize: 25,
  autoDropOnEasy: true,
  autoDropOnModerate: true,
  autoDropOnHard: false,
};

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: ulid(),
    name: 'Spanish',
    sourceLang: 'en',
    targetLang: 'es',
    settings: { ...defaultSettings },
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

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

function makeReview(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: ulid(),
    cardId: ulid(),
    pageId: ulid(),
    rating: 'easy',
    reviewedAt: 1_700_000_000_000,
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

// --- AC-1 ---------------------------------------------------------------------

describe('books repo', () => {
  it('TASK-005 AC-1: books.create writes a row that books.get can read back', async () => {
    const book = makeBook({ name: 'Japanese' });
    await books.create(book);

    const fetched = await books.get(book.id);
    expect(fetched).toEqual(book);
  });

  it('TASK-005 AC-1: books.get returns undefined for a missing id', async () => {
    const fetched = await books.get('nonexistent-id');
    expect(fetched).toBeUndefined();
  });

  it('TASK-005 AC-1: books.update mutates only listed fields; others preserved', async () => {
    const book = makeBook({
      name: 'Spanish',
      sourceLang: 'en',
      targetLang: 'es',
      createdAt: 1_700_000_000_000,
    });
    await books.create(book);

    await books.update(book.id, { name: 'Castilian' });

    const fetched = await books.get(book.id);
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe('Castilian');
    // Non-listed fields preserved.
    expect(fetched?.sourceLang).toBe('en');
    expect(fetched?.targetLang).toBe('es');
    expect(fetched?.createdAt).toBe(1_700_000_000_000);
    expect(fetched?.settings).toEqual(book.settings);
  });

  it('TASK-005 AC-1: books.update is a no-op on unrelated rows', async () => {
    const a = makeBook({ name: 'A' });
    const b = makeBook({ name: 'B' });
    await books.create(a);
    await books.create(b);

    await books.update(a.id, { name: 'A-renamed' });

    const fetchedB = await books.get(b.id);
    expect(fetchedB?.name).toBe('B');
  });

  it('TASK-005 AC-1: books.list returns [] when empty', async () => {
    const list = await books.list();
    expect(list).toEqual([]);
  });

  it('TASK-005 AC-1: books.list returns every book inserted', async () => {
    const a = makeBook({ name: 'A' });
    const b = makeBook({ name: 'B' });
    const c = makeBook({ name: 'C' });
    await books.create(a);
    await books.create(b);
    await books.create(c);

    const list = await books.list();
    const ids = list.map((row) => row.id).sort();
    expect(ids).toEqual([a.id, b.id, c.id].sort());
  });

  // --- AC-1 cascade: the load-bearing test. ----------------------------------

  it('TASK-005 AC-1: books.remove cascades to pages, cards, reviews of that book only', async () => {
    // Two books: only book A is the target of the cascade.
    const bookA = makeBook({ name: 'A' });
    const bookB = makeBook({ name: 'B' });
    await books.create(bookA);
    await books.create(bookB);

    // Book A: 2 pages, 3 cards across those pages, 2 reviews.
    const pageA1 = makePage({ bookId: bookA.id, title: 'A1' });
    const pageA2 = makePage({ bookId: bookA.id, title: 'A2' });
    const cardA1 = makeCard({ bookId: bookA.id, pageId: pageA1.id });
    const cardA2 = makeCard({ bookId: bookA.id, pageId: pageA1.id });
    const cardA3 = makeCard({ bookId: bookA.id, pageId: pageA2.id });
    const reviewA1 = makeReview({ cardId: cardA1.id, pageId: pageA1.id });
    const reviewA2 = makeReview({ cardId: cardA3.id, pageId: pageA2.id });

    // Book B: 1 page, 1 card, 1 review — must SURVIVE the cascade.
    const pageB1 = makePage({ bookId: bookB.id, title: 'B1' });
    const cardB1 = makeCard({ bookId: bookB.id, pageId: pageB1.id });
    const reviewB1 = makeReview({ cardId: cardB1.id, pageId: pageB1.id });

    await db.pages.bulkPut([pageA1, pageA2, pageB1]);
    await db.cards.bulkPut([cardA1, cardA2, cardA3, cardB1]);
    await db.reviews.bulkPut([reviewA1, reviewA2, reviewB1]);

    await books.remove(bookA.id);

    // Book A and its descendants are gone.
    expect(await books.get(bookA.id)).toBeUndefined();
    expect(await db.pages.get(pageA1.id)).toBeUndefined();
    expect(await db.pages.get(pageA2.id)).toBeUndefined();
    expect(await db.cards.get(cardA1.id)).toBeUndefined();
    expect(await db.cards.get(cardA2.id)).toBeUndefined();
    expect(await db.cards.get(cardA3.id)).toBeUndefined();
    expect(await db.reviews.get(reviewA1.id)).toBeUndefined();
    expect(await db.reviews.get(reviewA2.id)).toBeUndefined();

    // Book B and its descendants are untouched.
    expect(await books.get(bookB.id)).toEqual(bookB);
    expect(await db.pages.get(pageB1.id)).toEqual(pageB1);
    expect(await db.cards.get(cardB1.id)).toEqual(cardB1);
    expect(await db.reviews.get(reviewB1.id)).toEqual(reviewB1);
  });
});
