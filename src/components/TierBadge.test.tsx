import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { tierVisual } from '../lib/tiers';
import type { Tier } from '../db/db';
import { TierBadge } from './TierBadge';

// Source-level scan via vite ?raw — mirrors the pattern used in
// src/lib/tiers.test.ts AC-6 and src/App.test.tsx AC-1. Lets us assert AC-1
// ("imports tierVisual from ../lib/tiers, does NOT redefine the mapping
// locally") without coupling to runtime behaviour.
const BADGE_SOURCE_MODULES = import.meta.glob('./TierBadge.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const BADGE_SOURCE: string = BADGE_SOURCE_MODULES['./TierBadge.tsx'] ?? '';

const ALL_TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'] as const;

// ---------------------------------------------------------------------------
// TASK-008 AC-1: TierBadge consumes tierVisual from src/lib/tiers.ts and does
// NOT redefine the mapping locally.
// ---------------------------------------------------------------------------

describe('TierBadge — TASK-008 AC-1: consumes tierVisual from src/lib/tiers', () => {
  it('TASK-008 AC-1: TierBadge.tsx source was loaded (guards against silent empty-string)', () => {
    // kills: implementer forgetting to create the file entirely; the rest of
    // the source-scan assertions would all vacuously pass on an empty string.
    expect(BADGE_SOURCE.length).toBeGreaterThan(0);
  });

  it('TASK-008 AC-1: TierBadge.tsx imports from ../lib/tiers', () => {
    // kills: implementer inlining a private colour/label map instead of
    // consuming the canonical tierVisual.
    const singleQuoted = BADGE_SOURCE.includes("from '../lib/tiers'");
    const doubleQuoted = BADGE_SOURCE.includes('from "../lib/tiers"');
    expect(singleQuoted || doubleQuoted).toBe(true);
  });

  it('TASK-008 AC-1: TierBadge.tsx mentions tierVisual (not just an unused import)', () => {
    // kills: importing tierLabel only and reconstructing badge classes inline,
    // which would technically satisfy the import scan above but violate the
    // "consumed here unchanged" contract.
    expect(BADGE_SOURCE.includes('tierVisual')).toBe(true);
  });

  it('TASK-008 AC-1: TierBadge.tsx does NOT define its own badgeClass mapping', () => {
    // kills: implementer copy-pasting a `const BADGES = { bronze: ..., silver:
    // ..., gold: ... }` map into TierBadge.tsx. The canonical map lives in
    // src/lib/tiers.ts (TASK-006). Allow `badgeClass` as a destructured name
    // from tierVisual(...), but forbid a property-literal-style definition.
    const propLiteral = /badgeClass\s*:/;
    expect(propLiteral.test(BADGE_SOURCE)).toBe(false);
  });

  it('TASK-008 AC-1: TierBadge.tsx does NOT define its own tier-label mapping', () => {
    // kills: implementer hard-coding `'Bronze' | 'Silver' | 'Gold'` literals
    // inside the component instead of reading visual.label.
    expect(BADGE_SOURCE.includes("'Bronze'")).toBe(false);
    expect(BADGE_SOURCE.includes('"Bronze"')).toBe(false);
    expect(BADGE_SOURCE.includes("'Silver'")).toBe(false);
    expect(BADGE_SOURCE.includes('"Silver"')).toBe(false);
    expect(BADGE_SOURCE.includes("'Gold'")).toBe(false);
    expect(BADGE_SOURCE.includes('"Gold"')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TASK-008 AC-2 + AC-6: TierBadge renders the label text and the exact
// badgeClass string for each tier.
// ---------------------------------------------------------------------------

describe('TierBadge — TASK-008 AC-2 / AC-6: renders label and badgeClass per tier', () => {
  it.each(ALL_TIERS)(
    'TASK-008 AC-2: TierBadge tier=%s renders the label text from tierVisual(tier).label',
    (tier) => {
      const visual = tierVisual(tier);
      render(<TierBadge tier={tier} />);
      // kills: rendering the raw tier id ('bronze') instead of the label
      // ('Bronze'); also kills any drift between tierLabel and tierVisual.label.
      expect(screen.getByText(visual.label)).toBeInTheDocument();
    },
  );

  it.each(ALL_TIERS)(
    'TASK-008 AC-2 / AC-6: TierBadge tier=%s applies the EXACT badgeClass string via className',
    (tier) => {
      const visual = tierVisual(tier);
      const { container } = render(<TierBadge tier={tier} />);
      // Locate the badge element by its label text, then walk to the nearest
      // element that carries the badgeClass tokens. We avoid asserting on
      // container.firstChild directly so the implementer is free to wrap.
      const labelEl = screen.getByText(visual.label);

      // Build a list of candidate elements: the label element itself and each
      // ancestor up to (and including) the render container's root.
      const candidates: Element[] = [];
      let current: Element | null = labelEl;
      while (current && current !== container) {
        candidates.push(current);
        current = current.parentElement;
      }

      // The badgeClass token list must appear (substring match against the
      // full className) on at least one of those elements. kills: implementer
      // forgetting to pass `badgeClass` through, or paraphrasing it (e.g.
      // splitting into two classes that drop a token).
      const matching = candidates.find((el) =>
        (el.getAttribute('class') ?? '').includes(visual.badgeClass),
      );
      expect(
        matching,
        `expected an element rendered by <TierBadge tier="${tier}"/> to carry className containing "${visual.badgeClass}"`,
      ).toBeDefined();
    },
  );

  it.each(ALL_TIERS)(
    'TASK-008 AC-2: TierBadge tier=%s exposes an a11y signal (role="status" OR aria-label=label)',
    (tier) => {
      const visual = tierVisual(tier);
      render(<TierBadge tier={tier} />);

      // Prefer role="status" lookup; fall back to aria-label.
      // kills: relying on colour alone for tier identification, which would
      // fail WCAG and leave screen-reader users unable to distinguish tiers.
      const byRole = screen.queryAllByRole('status');
      const matchingRole = byRole.find((el) => el.textContent?.includes(visual.label));

      // aria-label lookup: any element whose aria-label exactly matches the
      // label (case-sensitive — the label is a fixed string from tierVisual).
      const byAriaLabel = screen.queryAllByLabelText(visual.label);
      const matchingAriaLabel = byAriaLabel.find((el) =>
        el.getAttribute('aria-label') === visual.label,
      );

      const hasA11ySignal =
        matchingRole !== undefined || matchingAriaLabel !== undefined;
      expect(
        hasA11ySignal,
        `<TierBadge tier="${tier}"/> must expose role="status" OR aria-label="${visual.label}"`,
      ).toBe(true);
    },
  );

  it.each(ALL_TIERS)(
    'TASK-008 AC-2: TierBadge tier=%s uses className, not inline style for colour (no style attribute)',
    (tier) => {
      const visual = tierVisual(tier);
      const { container } = render(<TierBadge tier={tier} />);
      const labelEl = screen.getByText(visual.label);

      // Find the element that actually carries the badgeClass (same walk as
      // the className test above), then assert that element has no inline
      // `style` attribute that sets colour-related properties.
      let badgeEl: Element | null = labelEl;
      while (
        badgeEl &&
        badgeEl !== container &&
        !(badgeEl.getAttribute('class') ?? '').includes(visual.badgeClass)
      ) {
        badgeEl = badgeEl.parentElement;
      }
      expect(badgeEl, 'must locate an element carrying badgeClass').not.toBeNull();

      // kills: implementer using `style={{ backgroundColor: '...', color: '...' }}`
      // instead of Tailwind className. AC-2 forbids inline style.
      const styleAttr = (badgeEl as Element).getAttribute('style') ?? '';
      expect(styleAttr.toLowerCase()).not.toContain('color');
      expect(styleAttr.toLowerCase()).not.toContain('background');
    },
  );
});
