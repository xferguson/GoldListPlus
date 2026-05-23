import { describe, it, expect } from 'vitest';
import { nextBronzeTitle } from './bronzeTitle';

// ---------------------------------------------------------------------------
// Vite-native raw import for purity scan (AC-18). Mirrors src/lib/tiers.test.ts.
// ---------------------------------------------------------------------------
const SOURCE_MODULES = import.meta.glob('./bronzeTitle.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const SOURCE: string = SOURCE_MODULES['./bronzeTitle.ts'] ?? '';

// ---------------------------------------------------------------------------
// TASK-011 AC-1: nextBronzeTitle pure helper
// ---------------------------------------------------------------------------
//
// One fixture-driven matrix test exercises the discriminating rows. The
// rationale (mutation-aware-assertions skill, rule 3): a single rich `it.each`
// catches more regressions per line than seven independent existence checks.
//
// The matrix is engineered so EACH row kills a distinct plausible mutation:
//  - empty                            → kills "return existing.length + 1"
//  - ['Bronze 1']                     → kills hardcoded "Bronze 1"
//  - ['Bronze 1','Bronze 2']          → kills "return Bronze N where N === sample.length"
//  - ['Bronze 1','Bronze 3']          → kills "return Bronze (max+1)" (would give Bronze 4)
//  - ['Bronze 2','Bronze 4','Bronze 5'] → kills BOTH max+1 (would give 6)
//                                          AND length+1 (would give 4)
//                                          AND monotonic counter (would give 6)
//  - mixed-tier with Silver/Gold       → kills "ignore tier prefix" / counts non-Bronze rows
//  - malformed titles                  → kills sloppy regex (lower-case, leading zero,
//                                          double-space, bare 'Bronze' must all be ignored)
// ---------------------------------------------------------------------------

describe('TASK-011 AC-1: nextBronzeTitle(existingTitles)', () => {
  it.each<{ name: string; input: string[]; expected: string }>([
    {
      name: 'AC-1.a: empty array → "Bronze 1"',
      input: [],
      expected: 'Bronze 1',
    },
    {
      name: 'AC-1.b: ["Bronze 1"] → "Bronze 2"',
      input: ['Bronze 1'],
      expected: 'Bronze 2',
    },
    {
      name: 'AC-1.c: ["Bronze 1","Bronze 2"] → "Bronze 3"',
      input: ['Bronze 1', 'Bronze 2'],
      expected: 'Bronze 3',
    },
    {
      name:
        'AC-1.d: gap reuse — ["Bronze 1","Bronze 3"] → "Bronze 2" (discriminates from max+1)',
      input: ['Bronze 1', 'Bronze 3'],
      expected: 'Bronze 2',
    },
    {
      name:
        'AC-1.e: multi-gap reuse — ["Bronze 2","Bronze 4","Bronze 5"] → "Bronze 1" (kills max+1, length+1, counter)',
      input: ['Bronze 2', 'Bronze 4', 'Bronze 5'],
      expected: 'Bronze 1',
    },
    {
      name:
        'AC-1.f: non-Bronze ignored — ["Silver 1","Gold 1","Bronze 1"] → "Bronze 2"',
      input: ['Silver 1', 'Gold 1', 'Bronze 1'],
      expected: 'Bronze 2',
    },
    {
      name:
        'AC-1.g: malformed ignored — ["Bronze","Bronze  2","bronze 1","Bronze 01"] → "Bronze 1"',
      input: ['Bronze', 'Bronze  2', 'bronze 1', 'Bronze 01'],
      expected: 'Bronze 1',
    },
  ])('$name', ({ input, expected }) => {
    expect(nextBronzeTitle(input)).toBe(expected);
  });

  // Extra discriminator: the smallest-unused-positive-integer rule should also
  // work for a gap right at 1 with only later occupied slots. This duplicates
  // some coverage of AC-1.e but explicitly proves the algorithm starts at 1
  // (not 0, which is a classic off-by-one).
  it('AC-1.h: starts at 1, not 0 — ["Bronze 1","Bronze 2","Bronze 3"] → "Bronze 4"', () => {
    expect(nextBronzeTitle(['Bronze 1', 'Bronze 2', 'Bronze 3'])).toBe('Bronze 4');
  });

  // Mutation challenge: an implementer that filters-then-sorts and reads
  // `parsed[parsed.length] + 1` (off-by-one) would still pass [1,2,3] above
  // because length=3, parsed[3]=undefined → NaN+1 → 'Bronze NaN' (fails).
  // But to be defensive against "max + 1" alternative shape, we also assert
  // input order is irrelevant.
  it('AC-1.i: input ordering is irrelevant — shuffled ["Bronze 3","Bronze 1"] still → "Bronze 2"', () => {
    expect(nextBronzeTitle(['Bronze 3', 'Bronze 1'])).toBe('Bronze 2');
  });
});

// ---------------------------------------------------------------------------
// TASK-011 AC-18: purity scan of src/lib/bronzeTitle.ts
// ---------------------------------------------------------------------------

describe('TASK-011 AC-18: src/lib/bronzeTitle.ts is pure (source-level scan)', () => {
  it('AC-18: bronzeTitle.ts source was loaded (guards against silent empty-string)', () => {
    // kills: a misconfigured `?raw` glob silently returning empty string —
    // every subsequent forbidden-substring check would pass vacuously.
    expect(SOURCE.length).toBeGreaterThan(0);
  });

  // Forbidden runtime imports. We test for both quote styles. Type-only
  // imports use the `import type` keyword and are permitted (none expected).
  const FORBIDDEN_MODULES: readonly string[] = [
    'react',
    'react-dom',
    'react-router-dom',
    'zustand',
    'dexie',
    '../db/db',
  ];

  it.each(FORBIDDEN_MODULES)(
    'AC-18: bronzeTitle.ts has no runtime `from "%s"` import',
    (mod) => {
      const single = `from '${mod}'`;
      const dbl = `from "${mod}"`;
      expect(
        SOURCE.includes(single) || SOURCE.includes(dbl),
        `bronzeTitle.ts unexpectedly imports from ${mod}`,
      ).toBe(false);
    },
  );

  // Repo paths are deeper — any '../db/repos/' substring is forbidden because
  // a pure lib helper has no reason to hit the data layer.
  it('AC-18: bronzeTitle.ts has no `../db/repos/` import path', () => {
    expect(SOURCE.includes('../db/repos/')).toBe(false);
  });

  it('AC-18: bronzeTitle.ts contains no `Date.now(` call', () => {
    expect(SOURCE.includes('Date.now(')).toBe(false);
  });

  it('AC-18: bronzeTitle.ts contains no `window.` reference', () => {
    expect(SOURCE.includes('window.')).toBe(false);
  });

  // Exports check: the file must export a named function `nextBronzeTitle`.
  // The import at top of file would fail at module load if the symbol were
  // missing, so the per-test imports already enforce existence — but a
  // source-level positive check guards against `export default` regressions
  // (which would still satisfy any-named import, breaking the AC-1 contract
  // shape).
  it('AC-18: bronzeTitle.ts exports a named function `nextBronzeTitle`', () => {
    expect(
      SOURCE.includes('export function nextBronzeTitle') ||
        SOURCE.includes('export const nextBronzeTitle') ||
        SOURCE.includes('export { nextBronzeTitle'),
    ).toBe(true);
  });
});
