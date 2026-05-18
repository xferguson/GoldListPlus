import { describe, it, expect, beforeEach } from 'vitest';
import {
  flagCardForDistillation,
  flagsForPage,
  finalizePage,
  type BuilderEntry,
  type FinalizePlan,
} from './distillation';
import type {
  BookSettings,
  Card,
  Page,
  Rating,
  ReviewEvent,
} from '../db/db';

// ---------- fixtures ----------------------------------------------------------

const NOW = 1_700_000_000_000;
const DAY_MS = 86_400_000;

function settings(
  autoDropOnEasy: boolean,
  autoDropOnModerate: boolean,
  autoDropOnHard: boolean,
): BookSettings {
  return {
    distillationIntervalDays: 14,
    headlistSize: 25,
    autoDropOnEasy,
    autoDropOnModerate,
    autoDropOnHard,
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'parent-page',
    bookId: 'book-1',
    title: 'Bronze 1',
    tier: 'bronze',
    createdAt: NOW - 14 * DAY_MS,
    reviewableAt: NOW,
    cardIds: ['c1', 'c2', 'c3'],
    ...overrides,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    bookId: 'book-1',
    pageId: 'parent-page',
    source: 'hola',
    target: 'hello',
    createdAt: NOW - 14 * DAY_MS,
    ...overrides,
  };
}

function makeReview(cardId: string, rating: Rating): ReviewEvent {
  return {
    id: `rev-${cardId}`,
    cardId,
    pageId: 'parent-page',
    rating,
    reviewedAt: NOW,
  };
}

// All 8 boolean triples for the three autoDrop flags (easy, moderate, hard).
const ALL_AUTO_DROP_COMBOS: Array<[boolean, boolean, boolean]> = [
  [false, false, false],
  [false, false, true],
  [false, true, false],
  [false, true, true],
  [true, false, false],
  [true, false, true],
  [true, true, false],
  [true, true, true],
];

// ---------- AC-2: `wrong` is always flagged (sacred rule, PRD §8 rule 2) -----

describe('TASK-004 AC-2: flagCardForDistillation — `wrong` always flagged', () => {
  it.each(ALL_AUTO_DROP_COMBOS)(
    'TASK-004 AC-2: `wrong` is flagged under (autoDropOnEasy=%s, autoDropOnModerate=%s, autoDropOnHard=%s)',
    (autoDropOnEasy, autoDropOnModerate, autoDropOnHard) => {
      const s = settings(autoDropOnEasy, autoDropOnModerate, autoDropOnHard);
      expect(flagCardForDistillation('wrong', s)).toBe(true);
    },
  );
});

// ---------- AC-3: full 4 × 8 matrix ------------------------------------------
// Rule (derived from PRD §3 step 6 and §8 rule 2):
//   - `wrong`    → always true (no setting overrides)
//   - `hard`     → true unless autoDropOnHard
//   - `moderate` → true unless autoDropOnModerate
//   - `easy`     → true unless autoDropOnEasy
//
// "Flagged" means "carried into the next list" (i.e. the user is being told the
// card still needs work). `autoDropOn*` flips the behaviour to "drop", i.e. not
// flagged.
//
// The matrix below mixes `true` and `false` expected values; an implementation
// that always returned `true` (or always `false`) would fail multiple rows.

type MatrixRow = {
  rating: Rating;
  autoDropOnEasy: boolean;
  autoDropOnModerate: boolean;
  autoDropOnHard: boolean;
  expected: boolean;
};

const MATRIX: MatrixRow[] = (['wrong', 'hard', 'moderate', 'easy'] as const)
  .flatMap((rating) =>
    ALL_AUTO_DROP_COMBOS.map(([e, m, h]) => {
      let expected: boolean;
      switch (rating) {
        case 'wrong':
          expected = true;
          break;
        case 'hard':
          expected = !h;
          break;
        case 'moderate':
          expected = !m;
          break;
        case 'easy':
          expected = !e;
          break;
      }
      return {
        rating,
        autoDropOnEasy: e,
        autoDropOnModerate: m,
        autoDropOnHard: h,
        expected,
      };
    }),
  );

describe('TASK-004 AC-3: flagCardForDistillation — full 4 × 8 ratings × settings matrix', () => {
  // Defensive sanity check on the test data itself: matrix should be 32 rows
  // with a mix of true and false expected values. Catches accidental
  // single-value matrices that would let a constant-return implementation pass.
  it('TASK-004 AC-3 (meta): matrix has 32 rows with both true and false expectations', () => {
    expect(MATRIX).toHaveLength(32);
    const trueCount = MATRIX.filter((r) => r.expected).length;
    const falseCount = MATRIX.filter((r) => !r.expected).length;
    expect(trueCount).toBeGreaterThan(0);
    expect(falseCount).toBeGreaterThan(0);
    // 8 wrong=true + 4 hard=true + 4 moderate=true + 4 easy=true = 20 true
    expect(trueCount).toBe(20);
    expect(falseCount).toBe(12);
  });

  it.each(MATRIX)(
    'TASK-004 AC-3: rating=$rating, autoDrop(easy=$autoDropOnEasy, moderate=$autoDropOnModerate, hard=$autoDropOnHard) → $expected',
    ({ rating, autoDropOnEasy, autoDropOnModerate, autoDropOnHard, expected }) => {
      const s = settings(autoDropOnEasy, autoDropOnModerate, autoDropOnHard);
      expect(flagCardForDistillation(rating, s)).toBe(expected);
    },
  );
});

// ---------- AC-4: flagsForPage ------------------------------------------------

describe('TASK-004 AC-4: flagsForPage', () => {
  it('TASK-004 AC-4: returns a Map keyed by cardId with per-card flags reflecting flagCardForDistillation', () => {
    // Pick settings that produce a mix of flags. With default-ish settings:
    //   autoDropOnEasy=true, autoDropOnModerate=true, autoDropOnHard=false:
    //   wrong → true, hard → true, moderate → false, easy → false
    const s = settings(true, true, false);
    const page = makePage({ cardIds: ['c1', 'c2', 'c3'] });
    const cards: Card[] = [
      makeCard({ id: 'c1' }),
      makeCard({ id: 'c2' }),
      makeCard({ id: 'c3' }),
    ];
    const latest = new Map<string, ReviewEvent>([
      ['c1', makeReview('c1', 'wrong')], // → flagged (sacred)
      ['c2', makeReview('c2', 'easy')], // → not flagged (autoDropOnEasy)
      ['c3', makeReview('c3', 'hard')], // → flagged (autoDropOnHard=false)
    ]);

    const result = flagsForPage(page, cards, latest, s);

    expect(result).toBeInstanceOf(Map);
    expect(result.get('c1')).toBe(true);
    expect(result.get('c2')).toBe(false);
    expect(result.get('c3')).toBe(true);
    // No surprise keys beyond the page's cards.
    expect(Array.from(result.keys()).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('TASK-004 AC-4: settings changes flip flags appropriately (autoDropOnHard=true → hard becomes not flagged)', () => {
    // Same three cards as above, but now also auto-drop hard. Only the
    // hardcoded `wrong` flag should remain.
    const s = settings(true, true, true);
    const page = makePage({ cardIds: ['c1', 'c2', 'c3'] });
    const cards: Card[] = [
      makeCard({ id: 'c1' }),
      makeCard({ id: 'c2' }),
      makeCard({ id: 'c3' }),
    ];
    const latest = new Map<string, ReviewEvent>([
      ['c1', makeReview('c1', 'wrong')],
      ['c2', makeReview('c2', 'easy')],
      ['c3', makeReview('c3', 'hard')],
    ]);

    const result = flagsForPage(page, cards, latest, s);

    expect(result.get('c1')).toBe(true); // sacred rule
    expect(result.get('c2')).toBe(false);
    expect(result.get('c3')).toBe(false);
  });

  it('TASK-004 AC-4: a Card with no ReviewEvent is not flagged (defensive)', () => {
    // Even with `wrong` settings that would otherwise force a flag, a card with
    // no ReviewEvent in the map must be reported as not flagged. The map's
    // contract is keyed by cardId, so the key is present with value false.
    const s = settings(false, false, false); // every rating would otherwise flag
    const page = makePage({ cardIds: ['c1', 'c2'] });
    const cards: Card[] = [
      makeCard({ id: 'c1' }),
      makeCard({ id: 'c2' }),
    ];
    const latest = new Map<string, ReviewEvent>([
      ['c1', makeReview('c1', 'wrong')],
      // c2 has no event
    ]);

    const result = flagsForPage(page, cards, latest, s);

    expect(result.get('c1')).toBe(true);
    expect(result.get('c2')).toBe(false);
    // The cardId must appear in the map as documented (keyed by cardId).
    expect(result.has('c2')).toBe(true);
  });

  it('TASK-004 AC-4: card present in `cards` but not in page.cardIds is excluded from the result', () => {
    // Defensive: flagsForPage is keyed off the page's cardIds, not the cards
    // array. A stray card not on the page should not appear in the result.
    const s = settings(true, true, false);
    const page = makePage({ cardIds: ['c1'] });
    const cards: Card[] = [
      makeCard({ id: 'c1' }),
      makeCard({ id: 'stray' }),
    ];
    const latest = new Map<string, ReviewEvent>([
      ['c1', makeReview('c1', 'wrong')],
      ['stray', makeReview('stray', 'wrong')],
    ]);

    const result = flagsForPage(page, cards, latest, s);

    expect(Array.from(result.keys())).toEqual(['c1']);
    expect(result.get('c1')).toBe(true);
    expect(result.has('stray')).toBe(false);
  });
});

// ---------- AC-5: finalizePage happy paths ------------------------------------

describe('TASK-004 AC-5: finalizePage — bronze → silver happy path', () => {
  const parent: Page = makePage({
    id: 'parent-page',
    bookId: 'book-1',
    tier: 'bronze',
    cardIds: ['c1', 'c2', 'c3'],
  });

  const builderEntries: BuilderEntry[] = [
    { source: 'hola', target: 'hello', parentIds: ['c1'] },
    { source: 'adios', target: 'goodbye', parentIds: ['c2', 'c3'] },
  ];

  const intervalDays = 14;

  // Compute the plan fresh per test to keep tests independent.
  let plan: FinalizePlan;
  beforeEach(() => {
    plan = finalizePage({
      parent,
      builderEntries,
      now: NOW,
      intervalDays,
    });
  });

  it('TASK-004 AC-5: childPage.tier === "silver"', () => {
    expect(plan.childPage.tier).toBe('silver');
  });

  it('TASK-004 AC-5: childPage.reviewableAt === now + intervalDays * 86_400_000', () => {
    expect(plan.childPage.reviewableAt).toBe(NOW + intervalDays * DAY_MS);
  });

  it('TASK-004 AC-5: childPage.parentPageId === parent.id', () => {
    expect(plan.childPage.parentPageId).toBe(parent.id);
  });

  it('TASK-004 AC-5: childPage.bookId === parent.bookId', () => {
    expect(plan.childPage.bookId).toBe(parent.bookId);
  });

  it('TASK-004 AC-5: childPage.id is a non-empty string and differs from parent.id', () => {
    expect(typeof plan.childPage.id).toBe('string');
    expect(plan.childPage.id.length).toBeGreaterThan(0);
    expect(plan.childPage.id).not.toBe(parent.id);
  });

  it('TASK-004 AC-5: childPage.cardIds length matches builderEntries length', () => {
    expect(plan.childPage.cardIds).toHaveLength(builderEntries.length);
  });

  it('TASK-004 AC-5: childPage.cardIds is the ordered list of newCards ids', () => {
    expect(plan.childPage.cardIds).toEqual(plan.newCards.map((c) => c.id));
  });

  it('TASK-004 AC-5: newCards.length === builderEntries.length', () => {
    expect(plan.newCards).toHaveLength(builderEntries.length);
  });

  it('TASK-004 AC-5: each newCard.pageId === childPage.id', () => {
    for (const card of plan.newCards) {
      expect(card.pageId).toBe(plan.childPage.id);
    }
  });

  it('TASK-004 AC-5: each newCard.bookId === parent.bookId', () => {
    for (const card of plan.newCards) {
      expect(card.bookId).toBe(parent.bookId);
    }
  });

  it('TASK-004 AC-5: each newCard.parentIds matches the corresponding builderEntry parentIds', () => {
    expect(plan.newCards).toHaveLength(builderEntries.length);
    for (let i = 0; i < builderEntries.length; i++) {
      const entry = builderEntries[i];
      const card = plan.newCards[i];
      if (entry === undefined || card === undefined) {
        throw new Error(`Unexpected undefined at index ${i}`);
      }
      expect(card.parentIds).toEqual(entry.parentIds);
    }
  });

  it('TASK-004 AC-5: each newCard.source and newCard.target copy through from the builder entry', () => {
    for (let i = 0; i < builderEntries.length; i++) {
      const entry = builderEntries[i];
      const card = plan.newCards[i];
      if (entry === undefined || card === undefined) {
        throw new Error(`Unexpected undefined at index ${i}`);
      }
      expect(card.source).toBe(entry.source);
      expect(card.target).toBe(entry.target);
    }
  });

  it('TASK-004 AC-5: each newCard.id is a non-empty string and unique within newCards', () => {
    const ids = plan.newCards.map((c) => c.id);
    for (const id of ids) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('TASK-004 AC-5: archivedCardIds equals parent.cardIds (order-insensitive)', () => {
    expect([...plan.archivedCardIds].sort()).toEqual([...parent.cardIds].sort());
  });
});

describe('TASK-004 AC-5: finalizePage — silver → gold happy path (gold is terminal)', () => {
  const parent: Page = makePage({
    id: 'silver-parent',
    bookId: 'book-1',
    tier: 'silver',
    cardIds: ['c1', 'c2'],
  });

  const builderEntries: BuilderEntry[] = [
    { source: 'hola', target: 'hello', parentIds: ['c1'] },
  ];

  it('TASK-004 AC-5: silver parent → childPage.tier === "gold"', () => {
    const plan = finalizePage({
      parent,
      builderEntries,
      now: NOW,
      intervalDays: 14,
    });
    expect(plan.childPage.tier).toBe('gold');
  });

  it('TASK-004 AC-5: silver parent → childPage.reviewableAt === null (PRD §8 rule 3)', () => {
    const plan = finalizePage({
      parent,
      builderEntries,
      now: NOW,
      intervalDays: 14,
    });
    expect(plan.childPage.reviewableAt).toBeNull();
  });

  it('TASK-004 AC-5: silver parent → archivedCardIds still equals parent.cardIds', () => {
    const plan = finalizePage({
      parent,
      builderEntries,
      now: NOW,
      intervalDays: 14,
    });
    expect([...plan.archivedCardIds].sort()).toEqual(['c1', 'c2']);
  });
});

// ---------- AC-6: finalizePage on a gold parent throws ------------------------

describe('TASK-004 AC-6: finalizePage throws on Gold parent', () => {
  it('TASK-004 AC-6: throws when parent.tier === "gold" (Gold is terminal)', () => {
    const goldParent: Page = makePage({
      id: 'gold-parent',
      bookId: 'book-1',
      tier: 'gold',
      reviewableAt: null,
      cardIds: ['c1'],
    });
    const builderEntries: BuilderEntry[] = [
      { source: 'hola', target: 'hello', parentIds: ['c1'] },
    ];

    expect(() =>
      finalizePage({
        parent: goldParent,
        builderEntries,
        now: NOW,
        intervalDays: 14,
      }),
    ).toThrow();
  });

  it('TASK-004 AC-6: does not throw for bronze or silver parents', () => {
    // Sanity-check the negative side of AC-6 so a buggy `throw always` impl
    // would fail. Without this, the AC-6 assertion could survive an impl
    // that simply throws on every call.
    const bronzeParent: Page = makePage({ tier: 'bronze' });
    const silverParent: Page = makePage({ tier: 'silver' });
    const builderEntries: BuilderEntry[] = [
      { source: 'a', target: 'b', parentIds: [] },
    ];
    expect(() =>
      finalizePage({
        parent: bronzeParent,
        builderEntries,
        now: NOW,
        intervalDays: 14,
      }),
    ).not.toThrow();
    expect(() =>
      finalizePage({
        parent: silverParent,
        builderEntries,
        now: NOW,
        intervalDays: 14,
      }),
    ).not.toThrow();
  });
});

