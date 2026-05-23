import { describe, it, expect, beforeEach } from 'vitest';
import { useReviewSessionStore } from './useReviewSessionStore';
import type { Rating } from '../db/db';

// Vite-native raw import keeps the source-purity scan free of node:fs. Mirrors
// the idiom established in src/lib/tiers.test.ts (TASK-006 AC-6) and
// src/App.test.tsx (TASK-007 AC-1/AC-6).
const STORE_SOURCE_MODULES = import.meta.glob('./useReviewSessionStore.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const STORE_SOURCE: string =
  STORE_SOURCE_MODULES['./useReviewSessionStore.ts'] ?? '';

// The documented initial empty shape (AC-1, AC-3, AC-7). Centralised so AC-1,
// AC-3, and AC-7 all measure against the same source of truth — a drift between
// them would be a real regression.
const INITIAL_STATE: {
  pageId: string | null;
  cardIds: string[];
  index: number;
  flipped: boolean;
  ratings: Record<string, Rating>;
} = {
  pageId: null,
  cardIds: [],
  index: 0,
  flipped: false,
  ratings: {},
};

// Reset to documented empty shape before every test. Calling reset() lets us
// validate the store via its own action surface (and incidentally exercises
// reset() in setup as well, but each AC-7 test asserts reset's contract
// independently with a non-trivial starting state).
beforeEach(() => {
  useReviewSessionStore.setState(INITIAL_STATE);
});

// ---------------------------------------------------------------------------
// AC-1: state shape (positive observation + every key documented)
// ---------------------------------------------------------------------------

describe('TASK-009 AC-1: store exposes the documented state shape', () => {
  // kills: dropping a field from the initial state (e.g. forgetting `ratings`)
  // — the deep-equal check fails on the missing key.
  it('TASK-009 AC-1: initial state matches { pageId:null, cardIds:[], index:0, flipped:false, ratings:{} }', () => {
    const state = useReviewSessionStore.getState();
    expect(state.pageId).toBeNull();
    expect(state.cardIds).toEqual([]);
    expect(state.index).toBe(0);
    expect(state.flipped).toBe(false);
    expect(state.ratings).toEqual({});
  });

  // kills: a refactor that renames or removes a field. We anchor the field
  // set so an unexpected new key (e.g. `flippedAt`) also fails — the store is
  // documented as a closed shape, and ADR-010 forbids growing it with derived
  // state.
  it('TASK-009 AC-1: state object has exactly the documented field set', () => {
    const state = useReviewSessionStore.getState();
    // Filter to data keys only — Zustand exposes action functions on the same
    // object, so we filter those out before comparing.
    const dataKeys = Object.keys(state)
      .filter((k) => typeof (state as Record<string, unknown>)[k] !== 'function')
      .sort();
    expect(dataKeys).toEqual(
      ['cardIds', 'flipped', 'index', 'pageId', 'ratings'].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// AC-2: actions are exposed as functions on the store
// ---------------------------------------------------------------------------

describe('TASK-009 AC-2: store exposes the documented action set', () => {
  // kills: removing or renaming an action (e.g. `start` → `begin`). Each
  // action is exercised behaviourally in later suites, but this guard fails
  // fast and gives a diagnostic message naming the missing symbol.
  it.each(['start', 'flip', 'rate', 'next', 'reset'] as const)(
    'TASK-009 AC-2: %s is a function on the store',
    (actionName) => {
      const state = useReviewSessionStore.getState() as Record<string, unknown>;
      expect(typeof state[actionName]).toBe('function');
    },
  );
});

// ---------------------------------------------------------------------------
// AC-3: start initialises every field and replaces an in-progress session
// ---------------------------------------------------------------------------

describe('TASK-009 AC-3: start(pageId, cardIds) initialises the session', () => {
  // kills: forgetting to set any one of pageId / cardIds / index / flipped /
  // ratings. The toEqual covers all five at once with discriminating data.
  it('TASK-009 AC-3: start sets pageId, copies cardIds, zeros index, clears flipped, empties ratings', () => {
    useReviewSessionStore.getState().start('PG_AAA', ['C1', 'C2', 'C3']);

    const state = useReviewSessionStore.getState();
    expect(state.pageId).toBe('PG_AAA');
    expect(state.cardIds).toEqual(['C1', 'C2', 'C3']);
    expect(state.index).toBe(0);
    expect(state.flipped).toBe(false);
    expect(state.ratings).toEqual({});
  });

  // kills: storing the input array reference directly (state.cardIds = input).
  // If the caller later mutates the source array, the store would silently
  // change. A copy (e.g. [...input] or input.slice()) is required by AC-3
  // ("cardIds copied").
  it('TASK-009 AC-3: start copies the cardIds array (mutating the input does not change store state)', () => {
    const input = ['C1', 'C2'];
    useReviewSessionStore.getState().start('PG_AAA', input);
    input.push('C3');
    expect(useReviewSessionStore.getState().cardIds).toEqual(['C1', 'C2']);
  });

  // kills: a `start` implementation that merges into existing state instead
  // of replacing it. We start with a dirty session (mid-rated, mid-flipped,
  // mid-index) and assert the second `start` produces the exact same shape
  // as the first call from a clean store.
  it('TASK-009 AC-3: start on an already-active session REPLACES it (no merge of prior ratings / index / flipped)', () => {
    // First session, dirtied: flipped on card 2, with a rating recorded for
    // card 1, and `index` advanced to 1.
    useReviewSessionStore.getState().start('PG_OLD', ['C1', 'C2', 'C3']);
    useReviewSessionStore.getState().rate('hard'); // ratings['C1'] = 'hard'
    useReviewSessionStore.getState().next(); // index = 1
    useReviewSessionStore.getState().flip(); // flipped = true

    // Sanity: confirm the first session is in a dirty state before we replace.
    const dirty = useReviewSessionStore.getState();
    expect(dirty.pageId).toBe('PG_OLD');
    expect(dirty.index).toBe(1);
    expect(dirty.flipped).toBe(true);
    expect(dirty.ratings).toEqual({ C1: 'hard' });

    // Replace with a new session that has DIFFERENT cardIds and pageId.
    useReviewSessionStore.getState().start('PG_NEW', ['D1', 'D2']);

    const replaced = useReviewSessionStore.getState();
    expect(replaced.pageId).toBe('PG_NEW');
    expect(replaced.cardIds).toEqual(['D1', 'D2']);
    expect(replaced.index).toBe(0);
    expect(replaced.flipped).toBe(false);
    // Critical: no leak of the prior 'C1' rating.
    expect(replaced.ratings).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// AC-4: flip toggles
// ---------------------------------------------------------------------------

describe('TASK-009 AC-4: flip() toggles the flipped flag', () => {
  // kills: flip always-set-to-true (a common bug shape). A second flip must
  // return to false.
  it('TASK-009 AC-4: flip toggles false → true → false (not "set true")', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1']);
    expect(useReviewSessionStore.getState().flipped).toBe(false);

    useReviewSessionStore.getState().flip();
    expect(useReviewSessionStore.getState().flipped).toBe(true);

    useReviewSessionStore.getState().flip();
    expect(useReviewSessionStore.getState().flipped).toBe(false);
  });

  // kills: flip mutating any other field. Only `flipped` may change.
  it('TASK-009 AC-4: flip does not touch pageId / cardIds / index / ratings', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2']);
    useReviewSessionStore.getState().rate('easy'); // ratings['C1'] = 'easy'

    const before = useReviewSessionStore.getState();
    const beforePageId = before.pageId;
    const beforeCardIds = before.cardIds;
    const beforeIndex = before.index;
    const beforeRatings = { ...before.ratings };

    useReviewSessionStore.getState().flip();

    const after = useReviewSessionStore.getState();
    expect(after.pageId).toBe(beforePageId);
    expect(after.cardIds).toEqual(beforeCardIds);
    expect(after.index).toBe(beforeIndex);
    expect(after.ratings).toEqual(beforeRatings);
  });
});

// ---------------------------------------------------------------------------
// AC-5: rate records the rating, does NOT advance, no-ops on bad state
// ---------------------------------------------------------------------------

describe('TASK-009 AC-5: rate(rating) records under cardIds[index]', () => {
  // kills: indexing the rating by something other than cardIds[index] — e.g.
  // by `cardIds[0]` (would still pass at index 0) or by ULID-string mismatch.
  // We rate at index 0, then advance, then rate again, and assert BOTH
  // ratings landed on the correct card.
  it('TASK-009 AC-5: rate at index 0 records under cardIds[0]; subsequent rate after next() records under cardIds[1]', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2', 'C3']);

    useReviewSessionStore.getState().rate('hard');
    expect(useReviewSessionStore.getState().ratings).toEqual({ C1: 'hard' });

    useReviewSessionStore.getState().next();

    useReviewSessionStore.getState().rate('easy');
    expect(useReviewSessionStore.getState().ratings).toEqual({
      C1: 'hard',
      C2: 'easy',
    });
  });

  // kills: rate ignoring the rating argument (e.g. always recording 'wrong').
  // Each rating value round-trips into the ratings map under the matching
  // cardId. Exhaustive matrix over the four Rating values.
  it.each(['wrong', 'hard', 'moderate', 'easy'] as const)(
    'TASK-009 AC-5: rate("%s") stores that exact rating value',
    (rating) => {
      useReviewSessionStore.getState().start('PG_A', ['C1']);
      useReviewSessionStore.getState().rate(rating);
      expect(useReviewSessionStore.getState().ratings).toEqual({ C1: rating });
    },
  );

  // kills: an over-helpful rate() that increments index (auto-advance is
  // explicitly NOT this store's job — AC-5 line 2: "It does NOT auto-advance").
  // The Review route (TASK-012) chooses when to call next() after rate().
  it('TASK-009 AC-5: rate does NOT auto-advance — index stays at 0 after rate', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2']);
    useReviewSessionStore.getState().rate('moderate');
    expect(useReviewSessionStore.getState().index).toBe(0);
  });

  // kills: rate doing more than recording the rating — e.g. resetting flipped.
  // Only `ratings` may change.
  it('TASK-009 AC-5: rate does not touch flipped / pageId / cardIds / index', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2']);
    useReviewSessionStore.getState().flip(); // flipped = true

    useReviewSessionStore.getState().rate('hard');

    const after = useReviewSessionStore.getState();
    expect(after.flipped).toBe(true);
    expect(after.pageId).toBe('PG_A');
    expect(after.cardIds).toEqual(['C1', 'C2']);
    expect(after.index).toBe(0);
  });

  // kills: removing the `pageId === null` guard. Without it, rate would write
  // `ratings[undefined] = rating` (cardIds is [] so cardIds[0] is undefined),
  // which would mutate `ratings` and fail this assertion.
  it('TASK-009 AC-5: rate is a no-op when pageId === null (state unchanged)', () => {
    // Initial (clean) state: pageId === null already. Capture full state and
    // assert it is byte-for-byte equal after the rate() call.
    const before = useReviewSessionStore.getState();
    const snapshot = {
      pageId: before.pageId,
      cardIds: [...before.cardIds],
      index: before.index,
      flipped: before.flipped,
      ratings: { ...before.ratings },
    };

    useReviewSessionStore.getState().rate('easy');

    const after = useReviewSessionStore.getState();
    expect(after.pageId).toBe(snapshot.pageId);
    expect(after.cardIds).toEqual(snapshot.cardIds);
    expect(after.index).toBe(snapshot.index);
    expect(after.flipped).toBe(snapshot.flipped);
    expect(after.ratings).toEqual(snapshot.ratings);
  });

  // kills: removing the index-bounds guard. After exhausting the card list
  // (index === cardIds.length), rate must NOT record under
  // cardIds[cardIds.length] (which is undefined).
  it('TASK-009 AC-5: rate is a no-op when index is at the sentinel (index === cardIds.length)', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2']);
    // Advance past the last card to the sentinel.
    useReviewSessionStore.getState().next(); // index 0 → 1
    useReviewSessionStore.getState().next(); // index 1 → 2 (sentinel)
    expect(useReviewSessionStore.getState().index).toBe(2);

    // Capture full state at the sentinel for byte-for-byte comparison.
    const before = useReviewSessionStore.getState();
    const snapshot = {
      pageId: before.pageId,
      cardIds: [...before.cardIds],
      index: before.index,
      flipped: before.flipped,
      ratings: { ...before.ratings },
    };

    useReviewSessionStore.getState().rate('wrong');

    const after = useReviewSessionStore.getState();
    expect(after.pageId).toBe(snapshot.pageId);
    expect(after.cardIds).toEqual(snapshot.cardIds);
    expect(after.index).toBe(snapshot.index);
    expect(after.flipped).toBe(snapshot.flipped);
    // Critical: no 'undefined' key sneaked into the ratings map.
    expect(after.ratings).toEqual(snapshot.ratings);
    expect(Object.keys(after.ratings)).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------
// AC-6: next advances, resets flipped, saturates at sentinel
// ---------------------------------------------------------------------------

describe('TASK-009 AC-6: next() advances index, resets flipped, saturates at sentinel', () => {
  // kills: next() incrementing by anything other than 1 (e.g. by 2). Two
  // calls take index from 0 to 2 only if each call adds exactly 1.
  it('TASK-009 AC-6: next advances index by 1 each call', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2', 'C3']);
    expect(useReviewSessionStore.getState().index).toBe(0);

    useReviewSessionStore.getState().next();
    expect(useReviewSessionStore.getState().index).toBe(1);

    useReviewSessionStore.getState().next();
    expect(useReviewSessionStore.getState().index).toBe(2);
  });

  // kills: next() leaving `flipped` untouched (a common omission — the
  // implementer remembers to bump index but forgets the flip reset). AC-6
  // explicitly: "resets `flipped` to `false`".
  it('TASK-009 AC-6: next resets flipped to false (flip, then next, expect flipped === false)', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2']);
    useReviewSessionStore.getState().flip(); // flipped = true
    expect(useReviewSessionStore.getState().flipped).toBe(true);

    useReviewSessionStore.getState().next();
    expect(useReviewSessionStore.getState().flipped).toBe(false);
  });

  // kills: next() resetting `ratings` (over-eager cleanup). Ratings live for
  // the entire session — they are read by the Distillation Review screen
  // after the session ends.
  it('TASK-009 AC-6: next does not erase prior ratings', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2']);
    useReviewSessionStore.getState().rate('moderate'); // ratings['C1'] = 'moderate'
    useReviewSessionStore.getState().next();
    expect(useReviewSessionStore.getState().ratings).toEqual({ C1: 'moderate' });
  });

  // kills: next() saturating one step early or one step late. The sentinel
  // is exactly cardIds.length — that's the value the Review route reads to
  // know the session is done.
  it('TASK-009 AC-6: next past the last card leaves index === cardIds.length (sentinel)', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2', 'C3']);
    useReviewSessionStore.getState().next(); // 0 → 1
    useReviewSessionStore.getState().next(); // 1 → 2
    useReviewSessionStore.getState().next(); // 2 → 3 (sentinel)
    expect(useReviewSessionStore.getState().index).toBe(3);
    expect(useReviewSessionStore.getState().cardIds.length).toBe(3);
  });

  // kills: removing the upper bound check, allowing index to grow past
  // cardIds.length. Further next() calls past the sentinel must be no-ops
  // on `index` (AC-6: "further `next()` calls do not increment beyond that").
  it('TASK-009 AC-6: further next() calls past the sentinel do NOT increment beyond cardIds.length', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2']);
    useReviewSessionStore.getState().next(); // 0 → 1
    useReviewSessionStore.getState().next(); // 1 → 2 (sentinel)
    expect(useReviewSessionStore.getState().index).toBe(2);

    // Three more no-op next() calls.
    useReviewSessionStore.getState().next();
    useReviewSessionStore.getState().next();
    useReviewSessionStore.getState().next();

    expect(useReviewSessionStore.getState().index).toBe(2);
  });

  // kills: a degenerate empty-session start where the sentinel is 0 and
  // next() still increments. With an empty cardIds, index starts at 0 and
  // 0 === cardIds.length, so we are at the sentinel from the first moment.
  it('TASK-009 AC-6: next() on an empty session (cardIds === []) does not move index off 0', () => {
    useReviewSessionStore.getState().start('PG_EMPTY', []);
    useReviewSessionStore.getState().next();
    useReviewSessionStore.getState().next();
    expect(useReviewSessionStore.getState().index).toBe(0);
    expect(useReviewSessionStore.getState().cardIds.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-7: reset returns to the documented initial empty shape
// ---------------------------------------------------------------------------

describe('TASK-009 AC-7: reset() returns state to the initial empty shape', () => {
  // kills: reset() that only resets a subset of fields (e.g. clears
  // `cardIds` but leaves `ratings` populated). The full-shape assertion
  // catches any partial reset.
  it('TASK-009 AC-7: reset clears pageId, cardIds, index, flipped, ratings (all five)', () => {
    // Dirty the store thoroughly so every field is non-initial.
    useReviewSessionStore.getState().start('PG_A', ['C1', 'C2', 'C3']);
    useReviewSessionStore.getState().rate('hard'); // ratings non-empty
    useReviewSessionStore.getState().next(); // index 0 → 1
    useReviewSessionStore.getState().flip(); // flipped = true

    // Sanity: confirm every field differs from initial before reset.
    const dirty = useReviewSessionStore.getState();
    expect(dirty.pageId).not.toBeNull();
    expect(dirty.cardIds.length).toBeGreaterThan(0);
    expect(dirty.index).not.toBe(0);
    expect(dirty.flipped).toBe(true);
    expect(Object.keys(dirty.ratings).length).toBeGreaterThan(0);

    useReviewSessionStore.getState().reset();

    const after = useReviewSessionStore.getState();
    expect(after.pageId).toBeNull();
    expect(after.cardIds).toEqual([]);
    expect(after.index).toBe(0);
    expect(after.flipped).toBe(false);
    expect(after.ratings).toEqual({});
  });

  // kills: reset() leaving an action reference dangling (e.g. setState
  // replacing the whole object and clobbering the actions). After reset,
  // the store must still be usable — calling start again must work.
  it('TASK-009 AC-7: reset preserves the action functions (store remains usable after reset)', () => {
    useReviewSessionStore.getState().start('PG_A', ['C1']);
    useReviewSessionStore.getState().reset();

    // The actions must still exist and behave correctly.
    const state = useReviewSessionStore.getState() as Record<string, unknown>;
    expect(typeof state.start).toBe('function');
    expect(typeof state.flip).toBe('function');
    expect(typeof state.rate).toBe('function');
    expect(typeof state.next).toBe('function');
    expect(typeof state.reset).toBe('function');

    useReviewSessionStore.getState().start('PG_B', ['D1']);
    expect(useReviewSessionStore.getState().pageId).toBe('PG_B');
    expect(useReviewSessionStore.getState().cardIds).toEqual(['D1']);
  });
});

// ---------------------------------------------------------------------------
// AC-8 + AC-9: source-level purity scan + no React rendering required
// ---------------------------------------------------------------------------

describe('TASK-009 AC-8: useReviewSessionStore.ts is pure (no I/O, no Dexie, no Date.now, no repos)', () => {
  const source = STORE_SOURCE;

  it('TASK-009 AC-8: store source was successfully loaded (guards against silent empty-string)', () => {
    // kills: a misconfigured `?raw` glob silently returning empty string —
    // every subsequent purity check would pass vacuously.
    expect(source.length).toBeGreaterThan(0);
  });

  // The forbidden runtime-import set per ADR-010 + PRD §8 rule 5:
  // - `dexie` (no IndexedDB wrapper imported)
  // - `../db/repos/*` (no repo imports — those write to IndexedDB)
  // The `../db/db` module is allowed ONLY for `import type` (Rating). A
  // value-shaped `import { ... } from '../db/db'` would pull in the Dexie
  // `db` instance and violate ADR-010.
  const FORBIDDEN_RUNTIME_MODULES: readonly string[] = [
    'dexie',
    '../db/repos/books',
    '../db/repos/pages',
    '../db/repos/cards',
    '../db/repos/reviews',
  ];

  it.each(FORBIDDEN_RUNTIME_MODULES)(
    'TASK-009 AC-8: store source has no runtime `from "%s"` import',
    (mod) => {
      const singleQuoted = `from '${mod}'`;
      const doubleQuoted = `from "${mod}"`;
      expect(
        source.includes(singleQuoted) || source.includes(doubleQuoted),
        `useReviewSessionStore.ts unexpectedly imports from ${mod}`,
      ).toBe(false);
    },
  );

  // kills: a `import { Rating } from '../db/db'` (value import) which would
  // implicitly evaluate db.ts and instantiate the GoldListDb singleton.
  // Only `import type` from '../db/db' is permitted (AC-8 + the Tech Lead's
  // task brief).
  it('TASK-009 AC-8: any import from ../db/db is `import type`, not a value import', () => {
    // Find every import line that references ../db/db.
    const importLines = source
      .split('\n')
      .filter((line) => /from\s+['"]\.\.\/db\/db['"]/.test(line));
    // It is legal for there to be zero such lines (if the implementer
    // re-declares the Rating union locally), but if any exists, it must be
    // `import type`. The TASK-009 brief expects `Rating` to be imported,
    // so we also assert at least one line exists.
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      // kills: `import { Rating } from '../db/db'` (value import) by
      // requiring the `type` keyword between `import` and the brace.
      // Either `import type { ... } from '../db/db'` or
      // `import { type Rating } from '../db/db'` is acceptable.
      const isTypeOnlyImport = /import\s+type\s+/.test(line);
      const isInlineTypeImport = /import\s+\{\s*type\s+/.test(line);
      expect(
        isTypeOnlyImport || isInlineTypeImport,
        `Line is not a type-only import: ${line}`,
      ).toBe(true);
    }
  });

  it('TASK-009 AC-8: store source contains no `Date.now(` call', () => {
    // kills: any time-stamping inside the store (ADR-010: store is
    // ephemeral; ReviewEvent timestamps live in the repo layer).
    expect(source.includes('Date.now(')).toBe(false);
  });

  it('TASK-009 AC-8: store source contains no `window.` reference', () => {
    // kills: stashing session state on `window.` or reading any global
    // browser surface that would couple the store to a DOM.
    expect(source.includes('window.')).toBe(false);
  });
});

describe('TASK-009 AC-9: store can be exercised without React rendering', () => {
  // kills: a store implementation that requires React context to function
  // (e.g. by exporting a hook factory that needs a Provider). The whole
  // test file above this point already exercises every action via
  // getState() — this final assertion documents that contract explicitly
  // so a future refactor doesn't accidentally regress it.
  it('TASK-009 AC-9: useReviewSessionStore.getState() and .setState() are callable outside React', () => {
    // Both must be functions on the store hook itself.
    expect(typeof useReviewSessionStore.getState).toBe('function');
    expect(typeof useReviewSessionStore.setState).toBe('function');

    // Round-trip: setState then getState reflects the change.
    useReviewSessionStore.setState({ pageId: 'PG_DIRECT' });
    expect(useReviewSessionStore.getState().pageId).toBe('PG_DIRECT');
  });
});
