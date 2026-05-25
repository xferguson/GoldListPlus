import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardRowEditor } from './CardRowEditor';
import type { Card } from '../../db/db';

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
// CHORE-006 AC-3: CardRowEditor renders prefilled inputs
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-3: CardRowEditor prefilled inputs', () => {
  it('CHORE-006 AC-3: renders Source + Target inputs prefilled with card.source and card.target', () => {
    render(
      <ul>
        <CardRowEditor
          card={makeCard({ source: 'orig-src', target: 'orig-tgt' })}
          onSave={vi.fn(async () => {})}
          onCancel={vi.fn()}
        />
      </ul>,
    );
    const src = screen.getByLabelText(/^source$/i) as HTMLInputElement;
    const tgt = screen.getByLabelText(/^target$/i) as HTMLInputElement;
    // Mutation challenge: prefilling both inputs with '' (empty strings)
    // instead of card.source / card.target would silently break the edit
    // UX. Distinct values for src/tgt also catch a swap.
    expect(src.value).toBe('orig-src');
    expect(tgt.value).toBe('orig-tgt');
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-3: Save invokes onSave with edited values
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-3: CardRowEditor Save path', () => {
  it('CHORE-006 AC-3: editing both inputs and clicking Save invokes onSave(newSource, newTarget) exactly once', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    const onCancel = vi.fn();
    render(
      <ul>
        <CardRowEditor
          card={makeCard({ source: 's1', target: 't1' })}
          onSave={onSave}
          onCancel={onCancel}
        />
      </ul>,
    );
    const src = screen.getByLabelText(/^source$/i);
    const tgt = screen.getByLabelText(/^target$/i);
    await user.clear(src);
    await user.type(src, 'newSrc');
    await user.clear(tgt);
    await user.type(tgt, 'newTgt');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    // Mutation challenge: onSave wired with (target, source) (swapped args)
    // — this positional assertion catches it.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('newSrc', 'newTgt');
    expect(onCancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-3: Cancel invokes onCancel; does NOT invoke onSave
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-3: CardRowEditor Cancel path', () => {
  it('CHORE-006 AC-3: clicking Cancel invokes onCancel exactly once and does not invoke onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    const onCancel = vi.fn();
    render(
      <ul>
        <CardRowEditor
          card={makeCard({ source: 's1', target: 't1' })}
          onSave={onSave}
          onCancel={onCancel}
        />
      </ul>,
    );
    // Type something to prove Cancel doesn't accidentally flush local state
    // through onSave.
    const src = screen.getByLabelText(/^source$/i);
    await user.clear(src);
    await user.type(src, 'edited-but-cancelled');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    // Mutation challenge: Cancel wired through `void handleSave()` instead of
    // `onCancel` — this catches it.
    expect(onSave).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-3: trimming behaviour preserved from index.tsx:159
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-3: CardRowEditor trims values before onSave', () => {
  it('CHORE-006 AC-3: typing whitespace-padded text and clicking Save passes trimmed values', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    render(
      <ul>
        <CardRowEditor
          card={makeCard({ source: 's1', target: 't1' })}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </ul>,
    );
    const src = screen.getByLabelText(/^source$/i);
    const tgt = screen.getByLabelText(/^target$/i);
    await user.clear(src);
    await user.clear(tgt);
    await user.type(src, '  newSrc  ');
    await user.type(tgt, '  newTgt  ');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    // Mutation challenge: dropping `.trim()` from the two values would pass
    // '  newSrc  ' / '  newTgt  ' through. This positional assertion catches
    // that — and uses distinct trimmed src/tgt strings to catch an arg-swap.
    expect(onSave).toHaveBeenCalledWith('newSrc', 'newTgt');
  });
});

// ---------------------------------------------------------------------------
// CHORE-006 AC-3: local state isolation — fresh remount restores card values
// ---------------------------------------------------------------------------

describe('CHORE-006 AC-3: CardRowEditor local state is per-mount', () => {
  it('CHORE-006 AC-3: a fresh Editor instance always prefills from card props (no shared module state)', async () => {
    const user = userEvent.setup();
    // First mount: type into source then unmount.
    const onSave = vi.fn(async () => {});
    const first = render(
      <ul>
        <CardRowEditor
          card={makeCard({ source: 'first-src', target: 'first-tgt' })}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </ul>,
    );
    const src1 = screen.getByLabelText(/^source$/i);
    await user.clear(src1);
    await user.type(src1, 'dirty-typing');
    first.unmount();

    // Second mount with new card values: editor must show those new values,
    // not the dirty typing from the previous mount.
    const second = render(
      <ul>
        <CardRowEditor
          card={makeCard({ source: 'second-src', target: 'second-tgt' })}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </ul>,
    );
    const src2 = second.getByLabelText(/^source$/i) as HTMLInputElement;
    const tgt2 = second.getByLabelText(/^target$/i) as HTMLInputElement;
    // Mutation challenge: storing source/target in a module-level let would
    // survive the unmount and leak across instances; these assertions catch
    // that.
    expect(src2.value).toBe('second-src');
    expect(tgt2.value).toBe('second-tgt');
  });
});
