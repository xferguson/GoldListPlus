import { db } from '../db';
import type { ReviewEvent } from '../db';

export async function append(event: ReviewEvent): Promise<void> {
  await db.reviews.add(event);
}

export async function listByCard(cardId: string): Promise<ReviewEvent[]> {
  return db.reviews.where('cardId').equals(cardId).sortBy('reviewedAt');
}

export async function listByPage(pageId: string): Promise<ReviewEvent[]> {
  return db.reviews.where('pageId').equals(pageId).sortBy('reviewedAt');
}

export async function latestPerCardForPage(
  pageId: string,
): Promise<Map<string, ReviewEvent>> {
  const events = await db.reviews.where('pageId').equals(pageId).toArray();
  const latest = new Map<string, ReviewEvent>();
  for (const event of events) {
    const prior = latest.get(event.cardId);
    if (prior === undefined || event.reviewedAt > prior.reviewedAt) {
      latest.set(event.cardId, event);
    }
  }
  return latest;
}
