import { db } from '../../db/db';
import type { Card, Page, ReviewEvent } from '../../db/db';
import type { ExportEnvelope } from '../../lib/sync/exportImport';

export async function runImportTransaction(
  envelope: ExportEnvelope,
): Promise<{ overwritten: number }> {
  let overwritten = 0;
  await db.transaction(
    'rw',
    [db.books, db.pages, db.cards, db.reviews],
    async () => {
      for (const row of envelope.books) {
        if ((await db.books.get(row.id)) !== undefined) overwritten += 1;
        await db.books.put(row);
      }
      for (const row of envelope.pages) {
        if ((await db.pages.get(row.id)) !== undefined) overwritten += 1;
        await db.pages.put(row);
      }
      for (const row of envelope.cards) {
        if ((await db.cards.get(row.id)) !== undefined) overwritten += 1;
        await db.cards.put(row);
      }
      for (const row of envelope.reviews) {
        if ((await db.reviews.get(row.id)) !== undefined) overwritten += 1;
        await db.reviews.put(row);
      }
    },
  );
  return { overwritten };
}

export async function collectDbIds(): Promise<{
  bookIds: Set<string>;
  pageIds: Set<string>;
  cardIds: Set<string>;
}> {
  const [bookIds, pageIds, cardIds] = await Promise.all([
    db.books.toCollection().primaryKeys(),
    db.pages.toCollection().primaryKeys(),
    db.cards.toCollection().primaryKeys(),
  ]);
  return {
    bookIds: new Set(bookIds),
    pageIds: new Set(pageIds),
    cardIds: new Set(cardIds),
  };
}

export async function readNonBookRows(): Promise<{
  pages: Page[];
  cards: Card[];
  reviews: ReviewEvent[];
}> {
  const [pageRows, cardRows, reviewRows] = await Promise.all([
    db.pages.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
  ]);
  return { pages: pageRows, cards: cardRows, reviews: reviewRows };
}
