import type { ReactNode } from 'react';
import type { Tier } from '../db/db';
import { tierVisual } from '../lib/tiers';

export function TierBorder({ tier, children }: { tier: Tier; children: ReactNode }) {
  const visual = tierVisual(tier);
  return <div className={`border-4 ${visual.borderClass}`}>{children}</div>;
}
