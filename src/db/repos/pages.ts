import { db } from '../db';
import type { Page } from '../db';
import type { FinalizePlan } from '../../lib/distillation';

export async function create(page: Page): Promise<void> {
  await db.pages.add(page);
}

export async function get(id: string): Promise<Page | undefined> {
  return db.pages.get(id);
}

export async function listByBook(bookId: string): Promise<Page[]> {
  return db.pages.where('bookId').equals(bookId).toArray();
}

export async function listDue(now: number): Promise<Page[]> {
  const candidates = await db.pages
    .where('reviewableAt')
    .belowOrEqual(now)
    .toArray();
  return candidates.filter((p) => p.reviewedAt === undefined);
}

export async function finalize(plan: FinalizePlan): Promise<void> {
  const parentPageId = plan.childPage.parentPageId;
  if (parentPageId === undefined) {
    throw new Error('finalize plan childPage is missing parentPageId.');
  }
  const finalizedAt = plan.childPage.createdAt;
  await db.transaction('rw', [db.pages, db.cards], async () => {
    await db.pages.add(plan.childPage);
    if (plan.newCards.length > 0) {
      await db.cards.bulkAdd(plan.newCards);
    }
    for (const cardId of plan.archivedCardIds) {
      await db.cards.update(cardId, { archivedAt: finalizedAt });
    }
    await db.pages.update(parentPageId, {
      childPageId: plan.childPage.id,
      reviewedAt: finalizedAt,
    });
  });
}
