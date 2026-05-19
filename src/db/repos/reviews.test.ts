import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ulid } from 'ulid';
import { db } from '../db';
import type { Rating, ReviewEvent } from '../db';
import * as reviews from './reviews';

// --- Factories ----------------------------------------------------------------

function makeReview(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: ulid(),
    cardId: ulid(),
    pageId: ulid(),
    rating: 'easy' as Rating,
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

// --- AC-5: append + read-back -------------------------------------------------

describe('reviews repo — append (TASK-005 AC-5)', () => {
  it('TASK-005 AC-5: reviews.append writes an event readable from the reviews table', async () => {
    const event = makeReview({
      cardId: 'card-1',
      pageId: 'page-1',
      rating: 'hard',
      reviewedAt: 1_700_000_001_000,
    });
    await reviews.append(event);

    const fetched = await db.reviews.get(event.id);
    expect(fetched).toEqual(event);
  });
});

// --- AC-5: listByCard ---------------------------------------------------------

describe('reviews repo — listByCard (TASK-005 AC-5)', () => {
  it('TASK-005 AC-5: reviews.listByCard returns only events for the requested card', async () => {
    const cardA = 'card-A';
    const cardB = 'card-B';
    const pageA = 'page-A';

    const e1 = makeReview({ cardId: cardA, pageId: pageA, reviewedAt: 100 });
    const e2 = makeReview({ cardId: cardA, pageId: pageA, reviewedAt: 200 });
    const e3 = makeReview({ cardId: cardB, pageId: pageA, reviewedAt: 150 });
    await reviews.append(e1);
    await reviews.append(e2);
    await reviews.append(e3);

    const forA = await reviews.listByCard(cardA);
    const idsForA = forA.map((e) => e.id).sort();
    expect(idsForA).toEqual([e1.id, e2.id].sort());
  });

  it('TASK-005 AC-5: reviews.listByCard returns events across multiple pages for that card', async () => {
    const card = 'card-1';
    const e1 = makeReview({ cardId: card, pageId: 'page-1', reviewedAt: 100 });
    const e2 = makeReview({ cardId: card, pageId: 'page-2', reviewedAt: 200 });
    // Noise: a different card on the same pages.
    const noise = makeReview({
      cardId: 'card-2',
      pageId: 'page-1',
      reviewedAt: 150,
    });
    await reviews.append(e1);
    await reviews.append(e2);
    await reviews.append(noise);

    const result = await reviews.listByCard(card);
    expect(result.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());
  });

  it('TASK-005 AC-5: reviews.listByCard returns events sorted ascending by reviewedAt', async () => {
    const card = 'card-1';
    // Insert OUT of order to defend against an implementation that relies on
    // insertion order rather than explicit sort.
    const later = makeReview({ cardId: card, reviewedAt: 300 });
    const earlier = makeReview({ cardId: card, reviewedAt: 100 });
    const middle = makeReview({ cardId: card, reviewedAt: 200 });
    await reviews.append(later);
    await reviews.append(earlier);
    await reviews.append(middle);

    const result = await reviews.listByCard(card);
    expect(result.map((e) => e.reviewedAt)).toEqual([100, 200, 300]);
  });

  it('TASK-005 AC-5: reviews.listByCard returns [] for a card with no events', async () => {
    // Seed events on a different card so the table is not empty.
    await reviews.append(makeReview({ cardId: 'someone-else' }));
    expect(await reviews.listByCard('nonexistent')).toEqual([]);
  });
});

// --- AC-5: listByPage ---------------------------------------------------------

describe('reviews repo — listByPage (TASK-005 AC-5)', () => {
  it('TASK-005 AC-5: reviews.listByPage returns only events for the requested page', async () => {
    const pageA = 'page-A';
    const pageB = 'page-B';

    const e1 = makeReview({ cardId: 'c1', pageId: pageA, reviewedAt: 100 });
    const e2 = makeReview({ cardId: 'c2', pageId: pageA, reviewedAt: 200 });
    const e3 = makeReview({ cardId: 'c1', pageId: pageB, reviewedAt: 150 });
    await reviews.append(e1);
    await reviews.append(e2);
    await reviews.append(e3);

    const forA = await reviews.listByPage(pageA);
    expect(forA.map((e) => e.id).sort()).toEqual([e1.id, e2.id].sort());

    const forB = await reviews.listByPage(pageB);
    expect(forB.map((e) => e.id)).toEqual([e3.id]);
  });

  it('TASK-005 AC-5: reviews.listByPage returns [] for a page with no events', async () => {
    await reviews.append(makeReview({ pageId: 'other-page' }));
    expect(await reviews.listByPage('nonexistent')).toEqual([]);
  });
});

// --- AC-5: latestPerCardForPage ----------------------------------------------

describe('reviews repo — latestPerCardForPage (TASK-005 AC-5)', () => {
  it('TASK-005 AC-5: latestPerCardForPage returns a Map keyed by cardId', async () => {
    const page = 'page-1';
    const e = makeReview({
      cardId: 'card-1',
      pageId: page,
      rating: 'easy',
      reviewedAt: 100,
    });
    await reviews.append(e);

    const result = await reviews.latestPerCardForPage(page);
    expect(result).toBeInstanceOf(Map);
    expect(result.get('card-1')).toEqual(e);
  });

  it('TASK-005 AC-5: latestPerCardForPage picks the event with maximum reviewedAt per card', async () => {
    const page = 'page-1';
    // Card 1 has three events on this page; the LATEST is the 'hard' one at 300.
    const c1_early = makeReview({
      cardId: 'c1',
      pageId: page,
      rating: 'wrong',
      reviewedAt: 100,
    });
    const c1_mid = makeReview({
      cardId: 'c1',
      pageId: page,
      rating: 'easy',
      reviewedAt: 200,
    });
    const c1_latest = makeReview({
      cardId: 'c1',
      pageId: page,
      rating: 'hard',
      reviewedAt: 300,
    });
    // Card 2 has two events; latest is 'moderate' at 250.
    const c2_early = makeReview({
      cardId: 'c2',
      pageId: page,
      rating: 'easy',
      reviewedAt: 50,
    });
    const c2_latest = makeReview({
      cardId: 'c2',
      pageId: page,
      rating: 'moderate',
      reviewedAt: 250,
    });
    // Insert out of order to defend against an implementation that returns
    // the first or last inserted event rather than max-by-reviewedAt.
    await reviews.append(c1_latest);
    await reviews.append(c2_early);
    await reviews.append(c1_early);
    await reviews.append(c2_latest);
    await reviews.append(c1_mid);

    const result = await reviews.latestPerCardForPage(page);
    expect(result.size).toBe(2);
    expect(result.get('c1')).toEqual(c1_latest);
    expect(result.get('c2')).toEqual(c2_latest);
  });

  it('TASK-005 AC-5: latestPerCardForPage scopes by pageId — same card, different page is ignored', async () => {
    const targetPage = 'page-target';
    const otherPage = 'page-other';

    // For 'c1' on the target page, the latest is reviewedAt=200 with 'easy'.
    const onTarget_old = makeReview({
      cardId: 'c1',
      pageId: targetPage,
      rating: 'wrong',
      reviewedAt: 100,
    });
    const onTarget_latest = makeReview({
      cardId: 'c1',
      pageId: targetPage,
      rating: 'easy',
      reviewedAt: 200,
    });
    // On the OTHER page, there's a later event for the same card. It must NOT
    // shadow the target-page result.
    const onOther_later = makeReview({
      cardId: 'c1',
      pageId: otherPage,
      rating: 'hard',
      reviewedAt: 999,
    });
    await reviews.append(onTarget_old);
    await reviews.append(onTarget_latest);
    await reviews.append(onOther_later);

    const result = await reviews.latestPerCardForPage(targetPage);
    expect(result.size).toBe(1);
    expect(result.get('c1')).toEqual(onTarget_latest);
  });

  it('TASK-005 AC-5: latestPerCardForPage excludes cards with zero events on that page', async () => {
    const targetPage = 'page-target';
    // 'c1' has an event on the target page.
    const c1_event = makeReview({
      cardId: 'c1',
      pageId: targetPage,
      rating: 'easy',
      reviewedAt: 100,
    });
    // 'c2' has events ONLY on a different page — must not appear.
    const c2_elsewhere = makeReview({
      cardId: 'c2',
      pageId: 'page-elsewhere',
      rating: 'easy',
      reviewedAt: 200,
    });
    await reviews.append(c1_event);
    await reviews.append(c2_elsewhere);

    const result = await reviews.latestPerCardForPage(targetPage);
    expect(result.size).toBe(1);
    expect(result.has('c1')).toBe(true);
    expect(result.has('c2')).toBe(false);
  });

  it('TASK-005 AC-5: latestPerCardForPage returns an empty Map for a page with no events', async () => {
    // Seed an event on a different page so the table is not empty.
    await reviews.append(makeReview({ pageId: 'other' }));

    const result = await reviews.latestPerCardForPage('page-empty');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});
