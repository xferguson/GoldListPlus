import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardRowDisplay } from './CardRowDisplay';
import type { Card } from '../../db/db';

// Source-scan target for AC-2 ("No `useState` for editing").
const DISPLAY_SOURCE_MODULES = import.meta.glob('./CardRowDisplay.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const DISPLAY_SOURCE: string =
  DISPLAY_SOURCE_MODULES['./CardRowDisplay.tsx'] ?? '';

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

// ---------------------------------------------------------------------------
// CHORE-006 AC-2: CardRowDisplay renders read-only row with edit/delete
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-2: CardRowDisplay renders card text', () => {
  it('CHORE-006 AC-2: renders both card.source and card.target visibly', () => {
    // Mutation challenge: dropping <span>{card.target}</span> from the
    // display would make this assertion fail. Discriminating values (not
    // shared substrings) catch a half-broken render.
    render(
      <ul>
        <CardRowDisplay
          card={makeCard({ source: 'hola-src', target: 'hello-tgt' })}
          locked={false}
          onEditRequested={vi.fn()}
          onDelete={vi.fn(async () => {})}
        />
      </ul>,
    );
    expect(screen.getByText('hola-src')).toBeInTheDocument();
    expect(screen.getByText('hello-tgt')).toBeInTheDocument();
  });
});

describe('CHORE-006 AC-2: CardRowDisplay Edit affordance', () => {
  it('CHORE-006 AC-2: Edit button renders when locked === false and click invokes onEditRequested exactly once', async () => {
    const user = userEvent.setup();
    const onEditRequested = vi.fn();
    render(
      <ul>
        <CardRowDisplay
          card={makeCard()}
          locked={false}
          onEditRequested={onEditRequested}
          onDelete={vi.fn(async () => {})}
        />
      </ul>,
    );
    const btn = screen.getByRole('button', { name: /edit card/i });
    expect(btn).toBeInTheDocument();

    await user.click(btn);
    // Mutation challenge: wiring onClick to onDelete instead of
    // onEditRequested would leave the call count at 0 here.
    expect(onEditRequested).toHaveBeenCalledTimes(1);
  });
});

describe('CHORE-006 AC-2: CardRowDisplay Delete affordance', () => {
  it('CHORE-006 AC-2: Delete button renders when locked === false and click invokes onDelete exactly once', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => {});
    const onEditRequested = vi.fn();
    render(
      <ul>
        <CardRowDisplay
          card={makeCard()}
          locked={false}
          onEditRequested={onEditRequested}
          onDelete={onDelete}
        />
      </ul>,
    );
    const btn = screen.getByRole('button', { name: /delete card/i });
    expect(btn).toBeInTheDocument();

    await user.click(btn);
    expect(onDelete).toHaveBeenCalledTimes(1);
    // Mutation challenge: if Delete wired through onEditRequested too, this
    // would fail.
    expect(onEditRequested).not.toHaveBeenCalled();
  });
});

describe('CHORE-006 AC-2: CardRowDisplay locked branch', () => {
  it('CHORE-006 AC-2: when locked === true, neither Edit nor Delete affordance renders, but card text remains visible', () => {
    render(
      <ul>
        <CardRowDisplay
          card={makeCard({ source: 'still-shown-src', target: 'still-shown-tgt' })}
          locked={true}
          onEditRequested={vi.fn()}
          onDelete={vi.fn(async () => {})}
        />
      </ul>,
    );
    // Card content still visible (PRD §5.5 — locked lists are read-only,
    // not hidden).
    expect(screen.getByText('still-shown-src')).toBeInTheDocument();
    expect(screen.getByText('still-shown-tgt')).toBeInTheDocument();
    // Affordances suppressed.
    expect(
      screen.queryByRole('button', { name: /edit card/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /delete card/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-2: source-scan — no editing-state useState in display
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-2: CardRowDisplay holds no editing state', () => {
  it('CHORE-006 AC-2: CardRowDisplay.tsx contains no `useState` (display is stateless re: editing)', () => {
    expect(DISPLAY_SOURCE.length).toBeGreaterThan(0);
    // Mutation challenge: smuggling `const [editing, setEditing] = useState(false)`
    // back into the display component would break the split's contract (the
    // orchestrator owns editing). This source-scan locks that down.
    expect(DISPLAY_SOURCE.includes('useState')).toBe(false);
  });
});
