import { describe, it, expect } from 'vitest';
import { nextTier, tierLabel, tierOrder, tierVisual } from './tiers';
import type { Tier } from '../db/db';

// Vite-native raw import keeps this test free of node:* (and @types/node) so
// src/lib/** purity is enforced by the typechecker too — no global `process`,
// `Buffer`, etc. leak in. Coupling to vite/vitest is fine: tests only run there.
const TIERS_SOURCE_MODULES = import.meta.glob('./tiers.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const TIERS_SOURCE: string = TIERS_SOURCE_MODULES['./tiers.ts'] ?? '';

describe('TASK-004 AC-1: nextTier lookup', () => {
  it('TASK-004 AC-1: nextTier("bronze") === "silver"', () => {
    const result: Tier | null = nextTier('bronze');
    expect(result).toBe('silver');
  });

  it('TASK-004 AC-1: nextTier("silver") === "gold"', () => {
    const result: Tier | null = nextTier('silver');
    expect(result).toBe('gold');
  });

  it('TASK-004 AC-1: nextTier("gold") === null (gold is terminal — PRD §8 rule 3)', () => {
    const result: Tier | null = nextTier('gold');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TASK-006: Tier visual mapping (label, order, visual)
// ---------------------------------------------------------------------------

const ALL_TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'] as const;

describe('TASK-006 AC-1: tierLabel returns PRD-aligned human labels', () => {
  it('TASK-006 AC-1: tierLabel("bronze") === "Bronze"', () => {
    expect(tierLabel('bronze')).toBe('Bronze');
  });

  it('TASK-006 AC-1: tierLabel("silver") === "Silver"', () => {
    expect(tierLabel('silver')).toBe('Silver');
  });

  it('TASK-006 AC-1: tierLabel("gold") === "Gold"', () => {
    expect(tierLabel('gold')).toBe('Gold');
  });
});

describe('TASK-006 AC-2: tierOrder yields a sort key bronze < silver < gold', () => {
  it('TASK-006 AC-2: sorting ["gold","bronze","silver"] by tierOrder produces ["bronze","silver","gold"]', () => {
    const input: Tier[] = ['gold', 'bronze', 'silver'];
    const sorted = [...input].sort((a, b) => tierOrder(a) - tierOrder(b));
    expect(sorted).toEqual<Tier[]>(['bronze', 'silver', 'gold']);
  });

  it('TASK-006 AC-2: tierOrder is stable across calls (same input → same output)', () => {
    for (const tier of ALL_TIERS) {
      const first = tierOrder(tier);
      const second = tierOrder(tier);
      expect(second).toBe(first);
    }
  });

  it('TASK-006 AC-2: tierOrder is strictly increasing bronze → silver → gold (rules out constant return)', () => {
    expect(tierOrder('bronze')).toBeLessThan(tierOrder('silver'));
    expect(tierOrder('silver')).toBeLessThan(tierOrder('gold'));
  });
});

describe('TASK-006 AC-3: tierVisual returns a well-formed object per tier', () => {
  it.each(ALL_TIERS)(
    'TASK-006 AC-3: tierVisual(%s).label equals tierLabel(%s) (drift-proof)',
    (tier) => {
      const visual = tierVisual(tier);
      expect(visual.label).toBe(tierLabel(tier));
    },
  );

  it.each(ALL_TIERS)(
    'TASK-006 AC-3: tierVisual(%s) class fields are non-empty, trimmed, no double spaces',
    (tier) => {
      const visual = tierVisual(tier);
      const classFields: ReadonlyArray<keyof typeof visual> = [
        'borderClass',
        'badgeClass',
        'textClass',
      ];
      for (const field of classFields) {
        const value = visual[field];
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
        // No leading/trailing whitespace.
        expect(value).toBe(value.trim());
        // No double spaces inside.
        expect(value.includes('  ')).toBe(false);
      }
    },
  );

  it('TASK-006 AC-3: borderClass / badgeClass / textClass are pairwise distinct across all three tiers', () => {
    const visuals = ALL_TIERS.map((t) => tierVisual(t));
    const fieldNames: ReadonlyArray<'borderClass' | 'badgeClass' | 'textClass'> =
      ['borderClass', 'badgeClass', 'textClass'];
    for (const field of fieldNames) {
      const values = visuals.map((v) => v[field]);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    }
  });
});

describe('TASK-006 AC-4: borderClass semantically matches the tier name (allow-set)', () => {
  // Allow-sets are deliberately small and palette-flexible. Overlap between
  // bronze and gold on `amber` is fine: AC-3 distinctness still forces a
  // different shade (e.g. amber-700 vs amber-400) or a different palette.
  const BORDER_ALLOW_REGEX: Record<Tier, RegExp> = {
    bronze: /^border-(amber|orange)-\d{2,3}$/,
    silver: /^border-(slate|zinc|gray|neutral)-\d{2,3}$/,
    gold: /^border-(yellow|amber)-\d{2,3}$/,
  };

  it.each(ALL_TIERS)(
    'TASK-006 AC-4: tierVisual(%s).borderClass contains a token from the %s allow-set',
    (tier) => {
      const visual = tierVisual(tier);
      const tokens = visual.borderClass.split(' ').filter((t) => t.length > 0);
      const regex = BORDER_ALLOW_REGEX[tier];
      const matchingToken = tokens.find((t) => regex.test(t));
      expect(
        matchingToken,
        `tier=${tier} borderClass=${visual.borderClass} contains no token matching ${regex}`,
      ).toBeDefined();
    },
  );
});

describe('TASK-006 AC-5: tierVisual is exhaustive — same key set per tier', () => {
  it('TASK-006 AC-5: Object.keys(tierVisual(t)) is identical (order + names) across all tiers', () => {
    const bronzeKeys = Object.keys(tierVisual('bronze'));
    const silverKeys = Object.keys(tierVisual('silver'));
    const goldKeys = Object.keys(tierVisual('gold'));
    expect(silverKeys).toEqual(bronzeKeys);
    expect(goldKeys).toEqual(bronzeKeys);
  });

  it('TASK-006 AC-5: tierVisual returns the documented field set { label, borderClass, badgeClass, textClass }', () => {
    // Anchored expectation so an unexpected new field (e.g. dark variants) also
    // fails AC-5 — Tech Lead said dark mode is out of scope for now.
    const keys = Object.keys(tierVisual('bronze')).sort();
    expect(keys).toEqual(['badgeClass', 'borderClass', 'label', 'textClass']);
  });
});

describe('TASK-006 AC-6: src/lib/tiers.ts remains pure (source-level scan)', () => {
  // Source text is loaded at module top via vite's `?raw` query — no node:fs.
  const source = TIERS_SOURCE;

  it('TASK-006 AC-6: tiers.ts source was successfully loaded (guards against silent empty-string)', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  // The forbidden set: value imports from React, React DOM, Dexie, or
  // react-router-dom. A `from '...'` substring is sufficient since these are
  // the only places those module specifiers can legitimately appear in a
  // `.ts` file. `import type { Tier } from '../db/db'` is explicitly allowed
  // by AC-6 footnote, so we do NOT forbid '../db/db'.
  const FORBIDDEN_MODULES: readonly string[] = [
    'react',
    'react-dom',
    'dexie',
    'react-router-dom',
  ];

  it.each(FORBIDDEN_MODULES)(
    'TASK-006 AC-6: tiers.ts has no `from "%s"` import',
    (mod) => {
      const singleQuoted = `from '${mod}'`;
      const doubleQuoted = `from "${mod}"`;
      expect(
        source.includes(singleQuoted) || source.includes(doubleQuoted),
        `tiers.ts unexpectedly imports from ${mod}`,
      ).toBe(false);
    },
  );

  it('TASK-006 AC-6: tiers.ts contains no `Date.now(` call', () => {
    expect(source.includes('Date.now(')).toBe(false);
  });

  it('TASK-006 AC-6: tiers.ts contains no `window.` reference', () => {
    expect(source.includes('window.')).toBe(false);
  });
});
