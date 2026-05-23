import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';

// Source-level scan of src/stores/useAppStore.ts via vite ?raw — enforces
// ADR-012 / §3 rule 4 purity (stores hold ephemeral session state; no Dexie
// I/O). Same pattern as src/lib/tiers.test.ts and src/App.test.tsx.
const STORE_SOURCE_MODULES = import.meta.glob('./useAppStore.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const STORE_SOURCE: string =
  STORE_SOURCE_MODULES['./useAppStore.ts'] ?? '';

// Reset the store between tests so we never observe cross-test leakage. The
// store is a single Zustand vanilla/React store with module-level state.
beforeEach(() => {
  useAppStore.getState().setCurrentBookId(null);
});

// ---------------------------------------------------------------------------
// TASK-010 AC-7: useAppStore shape and behaviour
// ---------------------------------------------------------------------------

describe('TASK-010 AC-7: useAppStore initial state', () => {
  // kills: a typo on the field name (e.g. `currentBook` vs `currentBookId`),
  // or initialising to anything other than null (e.g. '' would let downstream
  // code read truthy/falsey differently).
  it('TASK-010 AC-7: getState().currentBookId is null on first read', () => {
    expect(useAppStore.getState().currentBookId).toBeNull();
  });

  // kills: forgetting to export the setter, or exporting it under a different
  // name (e.g. `setBook`). The locked TASK-010 store shape names it exactly
  // `setCurrentBookId`.
  it('TASK-010 AC-7: getState().setCurrentBookId is a function', () => {
    expect(typeof useAppStore.getState().setCurrentBookId).toBe('function');
  });

  // kills: leaking extra slices (theme, settings, etc) into the v1 store
  // shape. TASKS.md TASK-010 explicitly forbids "theme, settings, repo
  // wrappers" until later tasks. Anchored key-set fails if a slice creeps in.
  it('TASK-010 AC-7: getState() has exactly { currentBookId, setCurrentBookId } and no other top-level keys', () => {
    const keys = Object.keys(useAppStore.getState()).sort();
    expect(keys).toEqual(['currentBookId', 'setCurrentBookId']);
  });
});

describe('TASK-010 AC-7: setCurrentBookId updates the state', () => {
  // kills: a setter that returns a new state but forgets to call `set(...)`,
  // or that sets a different key. The discriminating value rules out a
  // no-op.
  it('TASK-010 AC-7: setCurrentBookId("BK_01HXYZ") makes currentBookId === "BK_01HXYZ"', () => {
    useAppStore.getState().setCurrentBookId('BK_01HXYZ');
    expect(useAppStore.getState().currentBookId).toBe('BK_01HXYZ');
  });

  // kills: a setter that only accepts strings and silently drops null
  // (so the user could never clear the value). The "reset to null" path is
  // load-bearing for the future "user deleted their last book" flow.
  it('TASK-010 AC-7: setCurrentBookId(null) resets currentBookId to null', () => {
    useAppStore.getState().setCurrentBookId('BK_TEMP');
    expect(useAppStore.getState().currentBookId).toBe('BK_TEMP');
    useAppStore.getState().setCurrentBookId(null);
    expect(useAppStore.getState().currentBookId).toBeNull();
  });

  // kills: a setter that stores the value once and ignores subsequent calls
  // (a common bug when implementers reach for `useRef`-flavoured semantics).
  it('TASK-010 AC-7: setCurrentBookId can be called repeatedly with different values', () => {
    useAppStore.getState().setCurrentBookId('first');
    expect(useAppStore.getState().currentBookId).toBe('first');
    useAppStore.getState().setCurrentBookId('second');
    expect(useAppStore.getState().currentBookId).toBe('second');
    useAppStore.getState().setCurrentBookId('third');
    expect(useAppStore.getState().currentBookId).toBe('third');
  });
});

// ---------------------------------------------------------------------------
// TASK-010 AC-7: source-level purity scan
//
// §3 rule 4: Zustand stores hold only ephemeral session state. The store
// must NOT import Dexie, the Dexie schema module (../db/db), or any path
// under ../db/repos/. Repo calls live in the route component, not the store.
// ---------------------------------------------------------------------------

describe('TASK-010 AC-7: src/stores/useAppStore.ts has no I/O dependencies (source scan)', () => {
  it('TASK-010 AC-7: useAppStore.ts source was successfully loaded', () => {
    // kills: a silent ?raw failure that would make every forbidden-import
    // check pass trivially against an empty string.
    expect(STORE_SOURCE.length).toBeGreaterThan(0);
  });

  it('TASK-010 AC-7: useAppStore.ts contains no `from "dexie"` import', () => {
    // kills: an implementer pulling Dexie in to "cache" repo reads in the
    // store, which §3 rule 4 explicitly forbids.
    expect(STORE_SOURCE.includes("from 'dexie'")).toBe(false);
    expect(STORE_SOURCE.includes('from "dexie"')).toBe(false);
  });

  it('TASK-010 AC-7: useAppStore.ts contains no `from "../db/db"` import', () => {
    // kills: importing the Dexie singleton directly (which would also pull
    // Dexie transitively).
    expect(STORE_SOURCE.includes("from '../db/db'")).toBe(false);
    expect(STORE_SOURCE.includes('from "../db/db"')).toBe(false);
  });

  it('TASK-010 AC-7: useAppStore.ts contains no import from a path under "../db/repos/"', () => {
    // kills: the store wrapping repo calls (e.g. an action that calls
    // books.create on behalf of the route). NewBook.tsx is the only legal
    // caller of repos for this task; the store stays I/O-free.
    expect(STORE_SOURCE.includes('../db/repos/')).toBe(false);
  });
});
