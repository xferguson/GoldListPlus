import { db } from '../db';
import type { Book } from '../db';

export async function create(book: Book): Promise<void> {
  await db.books.add(book);
}

export async function get(id: string): Promise<Book | undefined> {
  return db.books.get(id);
}

export async function update(id: string, changes: Partial<Book>): Promise<void> {
  await db.books.update(id, changes);
}

export async function list(): Promise<Book[]> {
  return db.books.toArray();
}

export async function remove(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.books, db.pages, db.cards, db.reviews],
    async () => {
      const pageIds = await db.pages
        .where('bookId')
        .equals(id)
        .primaryKeys();
      const cardIds = await db.cards
        .where('bookId')
        .equals(id)
        .primaryKeys();

      if (pageIds.length > 0) {
        await db.reviews.where('pageId').anyOf(pageIds).delete();
      }
      if (cardIds.length > 0) {
        await db.reviews.where('cardId').anyOf(cardIds).delete();
      }
      await db.cards.where('bookId').equals(id).delete();
      await db.pages.where('bookId').equals(id).delete();
      await db.books.delete(id);
    },
  );
}
