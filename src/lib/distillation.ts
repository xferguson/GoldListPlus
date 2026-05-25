import type {
  BookSettings,
  Card,
  Page,
  Rating,
  ReviewEvent,
} from '../db/db';
import { newId } from '../db/ids';
import { nextTier } from './tiers';
import { MS_PER_DAY } from './time';

export type BuilderEntry = {
  source: string;
  target: string;
  parentIds: string[];
};

export type FinalizePlan = {
  childPage: Page;
  newCards: Card[];
  archivedCardIds: string[];
};

export function flagCardForDistillation(
  rating: Rating,
  settings: BookSettings,
): boolean {
  switch (rating) {
    case 'wrong':
      return true;
    case 'hard':
      return !settings.autoDropOnHard;
    case 'moderate':
      return !settings.autoDropOnModerate;
    case 'easy':
      return !settings.autoDropOnEasy;
  }
}

export function flagsForPage(
  page: Page,
  _cards: Card[],
  latestEventByCardId: Map<string, ReviewEvent>,
  settings: BookSettings,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const cardId of page.cardIds) {
    const event = latestEventByCardId.get(cardId);
    if (event === undefined) {
      result.set(cardId, false);
    } else {
      result.set(cardId, flagCardForDistillation(event.rating, settings));
    }
  }
  return result;
}

export function finalizePage(args: {
  parent: Page;
  builderEntries: BuilderEntry[];
  now: number;
  intervalDays: number;
}): FinalizePlan {
  const { parent, builderEntries, now, intervalDays } = args;
  if (parent.tier === 'gold') {
    throw new Error('Cannot finalize a Gold page: Gold tier is terminal.');
  }
  const childTier = nextTier(parent.tier);
  if (childTier === null) {
    throw new Error('Cannot finalize a Gold page: Gold tier is terminal.');
  }

  const childPageId = newId();
  const newCards: Card[] = builderEntries.map((entry) => ({
    id: newId(),
    bookId: parent.bookId,
    pageId: childPageId,
    source: entry.source,
    target: entry.target,
    createdAt: now,
    parentIds: entry.parentIds,
  }));

  const childPage: Page = {
    id: childPageId,
    bookId: parent.bookId,
    title: `${childTier} from ${parent.title}`,
    tier: childTier,
    createdAt: now,
    reviewableAt: childTier === 'gold' ? null : now + intervalDays * MS_PER_DAY,
    cardIds: newCards.map((c) => c.id),
    parentPageId: parent.id,
  };

  return {
    childPage,
    newCards,
    archivedCardIds: parent.cardIds.slice(),
  };
}
