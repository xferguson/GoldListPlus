import type { Tier } from '../db/db';

export function nextTier(tier: Tier): Tier | null {
  switch (tier) {
    case 'bronze':
      return 'silver';
    case 'silver':
      return 'gold';
    case 'gold':
      return null;
  }
}
