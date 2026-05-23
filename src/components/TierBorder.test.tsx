import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { tierVisual } from '../lib/tiers';
import type { Tier } from '../db/db';
import { TierBorder } from './TierBorder';

// Source-level scan via vite ?raw — see TierBadge.test.tsx for the rationale.
const BORDER_SOURCE_MODULES = import.meta.glob('./TierBorder.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const BORDER_SOURCE: string = BORDER_SOURCE_MODULES['./TierBorder.tsx'] ?? '';

const ALL_TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'] as const;

// ---------------------------------------------------------------------------
// TASK-008 AC-1: TierBorder consumes tierVisual from src/lib/tiers.ts and
// does NOT redefine the mapping locally.
// ---------------------------------------------------------------------------

describe('TierBorder — TASK-008 AC-1: consumes tierVisual from src/lib/tiers', () => {
  it('TASK-008 AC-1: TierBorder.tsx source was loaded (guards against silent empty-string)', () => {
    expect(BORDER_SOURCE.length).toBeGreaterThan(0);
  });

  it('TASK-008 AC-1: TierBorder.tsx imports from ../lib/tiers', () => {
    const singleQuoted = BORDER_SOURCE.includes("from '../lib/tiers'");
    const doubleQuoted = BORDER_SOURCE.includes('from "../lib/tiers"');
    expect(singleQuoted || doubleQuoted).toBe(true);
  });

  it('TASK-008 AC-1: TierBorder.tsx mentions tierVisual (not just an unused import)', () => {
    expect(BORDER_SOURCE.includes('tierVisual')).toBe(true);
  });

  it('TASK-008 AC-1: TierBorder.tsx does NOT define its own borderClass mapping', () => {
    // kills: implementer copy-pasting a private `{ bronze: 'border-amber-700',
    // silver: ..., gold: ... }` object into TierBorder.tsx instead of
    // consuming tierVisual().
    const propLiteral = /borderClass\s*:/;
    expect(propLiteral.test(BORDER_SOURCE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TASK-008 AC-3 + AC-6: TierBorder wraps children with borderClass + fixed
// border-width utility.
// ---------------------------------------------------------------------------

describe('TierBorder — TASK-008 AC-3 / AC-6: wrapper applies borderClass + fixed border width', () => {
  it.each(ALL_TIERS)(
    'TASK-008 AC-3 / AC-6: TierBorder tier=%s wrapper className contains the EXACT borderClass string',
    (tier) => {
      const visual = tierVisual(tier);
      const { container } = render(
        <TierBorder tier={tier}>
          <span data-testid="tb-child">hi</span>
        </TierBorder>,
      );
      const child = screen.getByTestId('tb-child');
      // Walk from the child up; the nearest ancestor carrying the borderClass
      // token list is the wrapper. kills: implementer dropping `borderClass`
      // entirely, or paraphrasing the token list (e.g. swapping
      // 'border-amber-700' for 'border-amber-600').
      let wrapper: Element | null = child.parentElement;
      while (
        wrapper &&
        wrapper !== container &&
        !(wrapper.getAttribute('class') ?? '').includes(visual.borderClass)
      ) {
        wrapper = wrapper.parentElement;
      }
      expect(
        wrapper && (wrapper.getAttribute('class') ?? '').includes(visual.borderClass),
        `expected an ancestor of the child to carry className containing "${visual.borderClass}"`,
      ).toBe(true);
    },
  );

  it.each(ALL_TIERS)(
    'TASK-008 AC-3: TierBorder tier=%s wrapper className contains a fixed border-width Tailwind utility (border-N)',
    (tier) => {
      const visual = tierVisual(tier);
      const { container } = render(
        <TierBorder tier={tier}>
          <span data-testid="tb-child">hi</span>
        </TierBorder>,
      );
      const child = screen.getByTestId('tb-child');
      // Find the wrapper that carries borderClass, then assert it ALSO carries
      // a fixed-width Tailwind border utility (border-2, border-4, border-8,
      // border-[6px], etc.). AC-3: "borderClass only contributes colour" — so
      // the wrapper must add a width independent of borderClass.
      let wrapper: Element | null = child.parentElement;
      while (
        wrapper &&
        wrapper !== container &&
        !(wrapper.getAttribute('class') ?? '').includes(visual.borderClass)
      ) {
        wrapper = wrapper.parentElement;
      }
      expect(wrapper).not.toBeNull();
      const className = (wrapper as Element).getAttribute('class') ?? '';
      const tokens = className.split(/\s+/).filter((t) => t.length > 0);

      // kills: implementer relying on Tailwind's default 1px border (i.e.
      // emitting bare `border` without an explicit width), which doesn't
      // satisfy AC-3 "fixed-width Tailwind border utility". Also kills the
      // absence of any width utility (border colour without width renders no
      // visible border at all).
      const hasFixedWidth = tokens.some((t) => /^border-\d+(\.\d+)?$/.test(t));
      expect(
        hasFixedWidth,
        `wrapper className "${className}" must contain a fixed-width utility like border-4 (matched by /^border-\\d+$/)`,
      ).toBe(true);
    },
  );

  it.each(ALL_TIERS)(
    'TASK-008 AC-3: TierBorder tier=%s renders children inside the wrapper',
    (tier) => {
      const { container } = render(
        <TierBorder tier={tier}>
          <span data-testid="tb-child">hi</span>
        </TierBorder>,
      );
      const child = screen.getByTestId('tb-child');
      // kills: implementer forgetting to render {children} at all (a wrapper
      // that paints a coloured border around nothing).
      expect(child).toBeInTheDocument();
      expect(child.textContent).toBe('hi');
      // kills: rendering children as a sibling of the wrapper instead of as a
      // descendant. The render container must transitively contain the child.
      expect(container.contains(child)).toBe(true);
    },
  );

  it.each(ALL_TIERS)(
    'TASK-008 AC-3: TierBorder tier=%s wrapper has no inline style.borderColor / style.borderWidth',
    (tier) => {
      const visual = tierVisual(tier);
      const { container } = render(
        <TierBorder tier={tier}>
          <span data-testid="tb-child">hi</span>
        </TierBorder>,
      );
      const child = screen.getByTestId('tb-child');
      let wrapper: Element | null = child.parentElement;
      while (
        wrapper &&
        wrapper !== container &&
        !(wrapper.getAttribute('class') ?? '').includes(visual.borderClass)
      ) {
        wrapper = wrapper.parentElement;
      }
      expect(wrapper).not.toBeNull();

      // kills: implementer using `style={{ borderColor: '#B87333',
      // borderWidth: 4 }}` instead of Tailwind className composition.
      // ADR-011 explicitly chose class strings over inline style.
      const styleAttr = ((wrapper as Element).getAttribute('style') ?? '').toLowerCase();
      expect(styleAttr).not.toContain('border-color');
      expect(styleAttr).not.toContain('border-width');
      expect(styleAttr).not.toContain('bordercolor');
      expect(styleAttr).not.toContain('borderwidth');
    },
  );
});
