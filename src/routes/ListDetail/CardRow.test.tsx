import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardRow } from './CardRow';
import type { Card } from '../../db/db';

// Source-scan target for AC-1 (≤30 non-blank LOC) and AC-7 (no
// `if (editing && !locked) return …` 30-line fall-through).
const CARDROW_SOURCE_MODULES = import.meta.glob('./CardRow.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const CARDROW_SOURCE: string = CARDROW_SOURCE_MODULES['./CardRow.tsx'] ?? '';

// Source-scan target for AC-4 (index.tsx no longer defines CardRow inline and
// has shrunk to ≤200 non-blank lines after the extraction).
const INDEX_SOURCE_MODULES = import.meta.glob('./index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const INDEX_SOURCE: string = INDEX_SOURCE_MODULES['./index.tsx'] ?? '';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    bookId: 'b1',
    pageId: 'p1',
    source: 'hola',
    target: 'hello',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function nonBlankLineCount(src: string): number {
  return src.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// CHORE-006 AC-1: thin orchestrator owns `editing` state
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-1: CardRow orchestrator default render', () => {
  it('CHORE-006 AC-1: default render shows the Display sub-component (Edit affordance visible, Source input absent)', () => {
    render(
      <ul>
        <CardRow
          card={makeCard()}
          locked={false}
          onSave={vi.fn(async () => {})}
          onDelete={vi.fn(async () => {})}
        />
      </ul>,
    );
    // Display affordance is present.
    expect(
      screen.getByRole('button', { name: /edit card/i }),
    ).toBeInTheDocument();
    // Editor's labelled input is NOT present in default render.
    expect(screen.queryByLabelText(/^source$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^target$/i)).not.toBeInTheDocument();
  });
});

describe('CHORE-006 AC-1: CardRow orchestrator edit toggle', () => {
  it('CHORE-006 AC-1: clicking Edit flips to the Editor sub-component (Source + Target inputs appear)', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <CardRow
          card={makeCard({ source: 's1', target: 't1' })}
          locked={false}
          onSave={vi.fn(async () => {})}
          onDelete={vi.fn(async () => {})}
        />
      </ul>,
    );
    await user.click(screen.getByRole('button', { name: /edit card/i }));

    // Editor's labelled inputs now visible.
    const src = screen.getByLabelText(/^source$/i) as HTMLInputElement;
    const tgt = screen.getByLabelText(/^target$/i) as HTMLInputElement;
    expect(src).toBeInTheDocument();
    expect(tgt).toBeInTheDocument();
    // Display affordance is gone.
    expect(
      screen.queryByRole('button', { name: /edit card/i }),
    ).not.toBeInTheDocument();
  });
});

describe('CHORE-006 AC-1: CardRow orchestrator cancel toggle', () => {
  it('CHORE-006 AC-1: invoking the editor onCancel returns to the Display sub-component', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <CardRow
          card={makeCard({ source: 's1', target: 't1' })}
          locked={false}
          onSave={vi.fn(async () => {})}
          onDelete={vi.fn(async () => {})}
        />
      </ul>,
    );
    await user.click(screen.getByRole('button', { name: /edit card/i }));
    await screen.findByLabelText(/^source$/i);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Back to Display.
    expect(
      await screen.findByRole('button', { name: /edit card/i }),
    ).toBeInTheDocument();
    // Editor inputs gone.
    expect(screen.queryByLabelText(/^source$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^target$/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-8: mutation trap — inverting `editing ? Editor : Display`
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-8: inverted-conditional mutation trap', () => {
  it('CHORE-006 AC-8: after clicking Edit, the Source input is visible and accepts a value', async () => {
    // Mutation challenge: if CardRow renders <CardRowDisplay/> when editing
    // is true (the inverted conditional), then clicking Edit would never show
    // the Source input — this assertion would fail.
    const user = userEvent.setup();
    render(
      <ul>
        <CardRow
          card={makeCard({ source: 'orig-src', target: 'orig-tgt' })}
          locked={false}
          onSave={vi.fn(async () => {})}
          onDelete={vi.fn(async () => {})}
        />
      </ul>,
    );
    await user.click(screen.getByRole('button', { name: /edit card/i }));

    const src = (await screen.findByLabelText(/^source$/i)) as HTMLInputElement;
    expect(src).toBeInTheDocument();

    // Accept a value (proves the editor really is mounted, not a stub).
    await user.clear(src);
    await user.type(src, 'mutated');
    expect(src.value).toBe('mutated');
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-1 + AC-7: source-scan constraints on CardRow.tsx
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-1: CardRow.tsx file size', () => {
  it('CHORE-006 AC-1: CardRow.tsx is ≤30 non-blank lines (thin orchestrator)', () => {
    expect(CARDROW_SOURCE.length).toBeGreaterThan(0);
    expect(nonBlankLineCount(CARDROW_SOURCE)).toBeLessThanOrEqual(30);
  });
});

describe('CHORE-006 AC-7: CardRow.tsx mode-parameter anti-pattern is gone', () => {
  it('CHORE-006 AC-7: CardRow.tsx contains no `if (editing && !locked)` early-return block', () => {
    expect(CARDROW_SOURCE.length).toBeGreaterThan(0);
    // Mutation challenge: if a future implementer re-introduces the 30-line
    // `if (editing && !locked) return <li>…</li>` fall-through, this assertion
    // fails. The orchestrator should be a ternary or two-branch JSX expression.
    expect(CARDROW_SOURCE.includes('if (editing && !locked)')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-4: index.tsx no longer defines CardRow inline; file is ≤200 LOC
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-4: index.tsx is a thin route after CardRow extraction', () => {
  it('CHORE-006 AC-4: index.tsx contains no `function CardRow` declaration and is ≤200 non-blank lines', () => {
    expect(INDEX_SOURCE.length).toBeGreaterThan(0);
    // Anchor on the function declaration form so that `<CardRow …>` JSX usage
    // (which IS required after extraction) does not trigger a false match.
    // Mutation challenge: if the inline `function CardRow(...)` block is left
    // behind alongside the new import, this assertion fails.
    expect(INDEX_SOURCE.includes('function CardRow')).toBe(false);
    // Mutation challenge: if the route grows back past 200 non-blank lines
    // (e.g. CardRow is re-inlined or new logic accretes), this assertion fails.
    expect(nonBlankLineCount(INDEX_SOURCE)).toBeLessThanOrEqual(200);
  });
});
