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

export function tierLabel(tier: Tier): 'Bronze' | 'Silver' | 'Gold' {
  switch (tier) {
    case 'bronze':
      return 'Bronze';
    case 'silver':
      return 'Silver';
    case 'gold':
      return 'Gold';
  }
}

export function tierOrder(tier: Tier): number {
  switch (tier) {
    case 'bronze':
      return 0;
    case 'silver':
      return 1;
    case 'gold':
      return 2;
  }
}

export function tierVisual(tier: Tier) {
  switch (tier) {
    case 'bronze':
      return {
        label: tierLabel(tier),
        borderClass: 'border-amber-700',
        badgeClass: 'bg-amber-100 text-amber-900',
        textClass: 'text-amber-800',
      };
    case 'silver':
      return {
        label: tierLabel(tier),
        borderClass: 'border-slate-400',
        badgeClass: 'bg-slate-100 text-slate-800',
        textClass: 'text-slate-700',
      };
    case 'gold':
      return {
        label: tierLabel(tier),
        borderClass: 'border-yellow-500',
        badgeClass: 'bg-yellow-100 text-yellow-900',
        textClass: 'text-yellow-700',
      };
  }
}
