import { db } from '../db';
import type { Card } from '../db';

export async function create(card: Card): Promise<void> {
  await db.cards.add(card);
}

export async function get(id: string): Promise<Card | undefined> {
  return db.cards.get(id);
}

export async function listByPage(pageId: string): Promise<Card[]> {
  return db.cards.where('pageId').equals(pageId).toArray();
}

export async function update(id: string, changes: Partial<Card>): Promise<void> {
  await db.transaction('rw', [db.pages, db.cards], async () => {
    await assertPageUnlocked(id);
    await db.cards.update(id, changes);
  });
}

export async function remove(id: string): Promise<void> {
  await db.transaction('rw', [db.pages, db.cards], async () => {
    await assertPageUnlocked(id);
    await db.cards.delete(id);
  });
}

async function assertPageUnlocked(cardId: string): Promise<void> {
  const card = await db.cards.get(cardId);
  if (card === undefined) {
    return;
  }
  const page = await db.pages.get(card.pageId);
  if (page?.reviewedAt !== undefined) {
    throw new Error(`Card ${cardId} is locked: parent page has been reviewed.`);
  }
}
