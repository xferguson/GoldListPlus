import type { Tier } from '../db/db';
import { tierVisual } from '../lib/tiers';

export function TierBadge({ tier }: { tier: Tier }) {
  const visual = tierVisual(tier);
  return (
    <span role="status" aria-label={visual.label} className={visual.badgeClass}>
      {visual.label}
    </span>
  );
}
