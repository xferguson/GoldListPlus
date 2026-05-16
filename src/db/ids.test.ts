import { describe, it, expect } from 'vitest';
import { newId } from './ids';

// Crockford base32: 0-9 and A-Z minus I, L, O, U.
const CROCKFORD_CHAR = /^[0-9A-HJKMNP-TV-Z]+$/;

describe('newId (TASK-003 AC-3 / AC-4)', () => {
  it('TASK-003 AC-3: returns a string of exactly 26 characters', () => {
    const id = newId();
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(26);
  });

  it('TASK-003 AC-3: every character is from Crockford base32 (no I, L, O, U)', () => {
    // Sample 100 IDs to make this robust against the random suffix.
    for (let i = 0; i < 100; i++) {
      const id = newId();
      expect(id).toMatch(CROCKFORD_CHAR);
    }
  });

  it('TASK-003 AC-3: 1000 consecutive calls are strictly monotonically increasing', () => {
    const ids: string[] = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(newId());
    }
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i];
      const b = ids[i + 1];
      // Type guards for noUncheckedIndexedAccess.
      if (a === undefined || b === undefined) {
        throw new Error(`Unexpected undefined ID at position ${i}`);
      }
      expect(
        a < b,
        `IDs not monotonically increasing at index ${i}: ${a} >= ${b}`,
      ).toBe(true);
    }
  });

  it('TASK-003 AC-4: 1000 consecutive calls are all unique', () => {
    const ids: string[] = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(newId());
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(1000);
  });
});
