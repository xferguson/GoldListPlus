import { describe, it, expect } from 'vitest';
import { nextTier } from './tiers';
import type { Tier } from '../db/db';

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
