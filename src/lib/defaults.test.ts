import { describe, it, expect } from 'vitest';
import { DEFAULT_BOOK_SETTINGS, BOOK_NAME_MAX_LENGTH } from './defaults';
import type { BookSettings } from '../db/db';

// Source-level scan of src/lib/defaults.ts via vite ?raw — mirrors the pattern
// established in src/lib/tiers.test.ts (TASK-006 AC-6) and src/App.test.tsx
// (TASK-007 AC-1/AC-6). Lets us assert §3 layering purity without relying on
// runtime behaviour.
const DEFAULTS_SOURCE_MODULES = import.meta.glob('./defaults.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const DEFAULTS_SOURCE: string =
  DEFAULTS_SOURCE_MODULES['./defaults.ts'] ?? '';

// ---------------------------------------------------------------------------
// TASK-010 AC-6: DEFAULT_BOOK_SETTINGS shape + literal values
// ---------------------------------------------------------------------------

describe('TASK-010 AC-6: DEFAULT_BOOK_SETTINGS is deeply equal to the PRD §5.1 / §3 step 6 defaults', () => {
  // The locked-spec defaults from TASKS.md TASK-010 (architectural notes):
  //   distillationIntervalDays: 14
  //   headlistSize: 25
  //   autoDropOnHard: false       <- HARDest setting is "review again", PRD default
  //   autoDropOnModerate: true    <- moderate drops by default (PRD §3 step 6)
  //   autoDropOnEasy: true        <- easy drops by default
  //
  // kills: any single-field flip (e.g. autoDropOnHard: true would silently
  // change product behaviour from "hard cards always re-reviewed" to
  // "hard cards dropped" — a sacred-rule-adjacent regression).
  it('TASK-010 AC-6: DEFAULT_BOOK_SETTINGS deep-equals the locked default object', () => {
    const expected: BookSettings = {
      distillationIntervalDays: 14,
      headlistSize: 25,
      autoDropOnHard: false,
      autoDropOnModerate: true,
      autoDropOnEasy: true,
    };
    expect(DEFAULT_BOOK_SETTINGS).toEqual(expected);
  });

  // kills: forgetting `autoDropOnWrong` would slip in (PRD §8 rule 2 — `wrong`
  // is always flagged, hardcoded, no setting). Anchored key-set forbids adding
  // unintended fields.
  it('TASK-010 AC-6: DEFAULT_BOOK_SETTINGS has exactly the 5 documented fields and no others', () => {
    const keys = Object.keys(DEFAULT_BOOK_SETTINGS).sort();
    expect(keys).toEqual([
      'autoDropOnEasy',
      'autoDropOnHard',
      'autoDropOnModerate',
      'distillationIntervalDays',
      'headlistSize',
    ]);
  });

  // kills: a field's *type* drifting (e.g. distillationIntervalDays as string
  // "14" because someone reads it from a form). The BookSettings shape from
  // db.ts already enforces this at compile time; this is the runtime guard.
  it('TASK-010 AC-6: DEFAULT_BOOK_SETTINGS field types match the BookSettings shape', () => {
    expect(typeof DEFAULT_BOOK_SETTINGS.distillationIntervalDays).toBe('number');
    expect(typeof DEFAULT_BOOK_SETTINGS.headlistSize).toBe('number');
    expect(typeof DEFAULT_BOOK_SETTINGS.autoDropOnHard).toBe('boolean');
    expect(typeof DEFAULT_BOOK_SETTINGS.autoDropOnModerate).toBe('boolean');
    expect(typeof DEFAULT_BOOK_SETTINGS.autoDropOnEasy).toBe('boolean');
  });
});

describe('TASK-010 AC-6: BOOK_NAME_MAX_LENGTH is exactly 80', () => {
  // kills: silently widening or narrowing the max (PRD §5.1 locks it at 80).
  it('TASK-010 AC-6: BOOK_NAME_MAX_LENGTH === 80', () => {
    expect(BOOK_NAME_MAX_LENGTH).toBe(80);
  });

  it('TASK-010 AC-6: BOOK_NAME_MAX_LENGTH is a number, not a string', () => {
    // kills: exporting `'80'` and relying on coercion; the input's maxLength
    // attribute would still work numerically but explicit-length checks would
    // produce nonsense (`'80'.length === 2`).
    expect(typeof BOOK_NAME_MAX_LENGTH).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// TASK-010 AC-6: source-level purity scan
//
// §3 rule 2: src/lib/** is pure. defaults.ts must not depend on React,
// React DOM, react-router-dom, Zustand, Dexie, or any path under
// src/db/repos/**. Type-only imports from ../db/db are explicitly permitted
// (ADR-012 layering note).
// ---------------------------------------------------------------------------

describe('TASK-010 AC-6: src/lib/defaults.ts remains pure (source-level scan)', () => {
  it('TASK-010 AC-6: defaults.ts source was successfully loaded', () => {
    // kills: a silent ?raw failure that would make every forbidden-import
    // check pass trivially against an empty string.
    expect(DEFAULTS_SOURCE.length).toBeGreaterThan(0);
  });

  const FORBIDDEN_MODULES: readonly string[] = [
    'react',
    'react-dom',
    'react-router-dom',
    'zustand',
    'dexie',
  ];

  it.each(FORBIDDEN_MODULES)(
    'TASK-010 AC-6: defaults.ts has no value import from "%s"',
    (mod) => {
      const singleQuoted = `from '${mod}'`;
      const doubleQuoted = `from "${mod}"`;
      expect(
        DEFAULTS_SOURCE.includes(singleQuoted) ||
          DEFAULTS_SOURCE.includes(doubleQuoted),
        `defaults.ts unexpectedly imports from ${mod}`,
      ).toBe(false);
    },
  );

  // kills: importing a concrete repo (e.g. `* as books from '../db/repos/books'`)
  // which would couple a pure constants module to Dexie I/O. The path scan is
  // intentionally a substring check; `../db/repos/` is the literal prefix of
  // every legal repo import from `src/lib/`.
  it('TASK-010 AC-6: defaults.ts contains no import from a path under "../db/repos/"', () => {
    expect(DEFAULTS_SOURCE.includes('../db/repos/')).toBe(false);
  });

  // Also forbid any runtime Date.now() — defaults are static, not derived from
  // the current instant.
  it('TASK-010 AC-6: defaults.ts contains no `Date.now(` call', () => {
    expect(DEFAULTS_SOURCE.includes('Date.now(')).toBe(false);
  });
});
