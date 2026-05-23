import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

// Modal renders into document.body via createPortal (ADR-009). RTL's default
// `cleanup` unmounts the host node but does NOT remove portal children unless
// the component itself unmounts cleanly. We run cleanup explicitly between
// tests to keep document.body uncluttered.
afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// TASK-008 AC-4: Modal open/closed render + portal target + a11y attrs
// ---------------------------------------------------------------------------

describe('Modal — TASK-008 AC-4: open=false renders nothing', () => {
  it('TASK-008 AC-4: when open=false, no role="dialog" element is in the document', () => {
    const onClose = vi.fn();
    render(
      <Modal open={false} onClose={onClose} title="Hidden">
        <p>body</p>
      </Modal>,
    );
    // kills: implementer always rendering the dialog and hiding it via CSS;
    // AC-4 says "renders nothing" when open=false.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('TASK-008 AC-4: when open=false, the title text is NOT present anywhere in document.body', () => {
    const onClose = vi.fn();
    render(
      <Modal open={false} onClose={onClose} title="UNIQUE_TITLE_42">
        <p>secret body content</p>
      </Modal>,
    );
    // kills: implementer rendering the dialog at zero opacity / display:none
    // (text would still be in the DOM). The portal-leak guard would miss a
    // hidden-but-mounted dialog; the body-text guard catches it.
    expect(document.body.textContent ?? '').not.toContain('UNIQUE_TITLE_42');
    expect(document.body.textContent ?? '').not.toContain('secret body content');
  });
});

describe('Modal — TASK-008 AC-4: open=true renders a dialog with a11y attributes', () => {
  it('TASK-008 AC-4: when open=true, a role="dialog" element is rendered', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Confirm">
        <p>body</p>
      </Modal>,
    );
    // kills: implementer using <div> with no role attribute. Screen readers
    // need role="dialog" to announce the modal.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('TASK-008 AC-4: dialog has aria-modal="true"', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Confirm">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    // kills: implementer forgetting aria-modal, which lets AT pierce into
    // background content. ARIA spec requires "true" specifically.
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('TASK-008 AC-4: dialog has aria-label OR aria-labelledby reflecting title', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="MY_UNIQUE_TITLE">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const ariaLabel = dialog.getAttribute('aria-label');
    const labelledBy = dialog.getAttribute('aria-labelledby');

    // Strategy: at least one of the two must be set, and whichever is set
    // must resolve to the title string. kills: implementer setting an empty
    // aria-label, or labelledby pointing at a non-existent id.
    if (ariaLabel !== null) {
      expect(ariaLabel).toBe('MY_UNIQUE_TITLE');
    } else {
      expect(labelledBy).not.toBeNull();
      const id = labelledBy as string;
      const labelEl = document.getElementById(id);
      expect(
        labelEl,
        `aria-labelledby="${id}" must resolve to an element in the document`,
      ).not.toBeNull();
      expect((labelEl as HTMLElement).textContent).toContain('MY_UNIQUE_TITLE');
    }
  });

  it('TASK-008 AC-4: dialog renders children inside it', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Confirm">
        <p data-testid="modal-body-marker">body-content-xyz</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const body = screen.getByTestId('modal-body-marker');
    // kills: implementer rendering children as a sibling of the dialog
    // instead of inside it (would still satisfy the "children render"
    // pseudo-criterion but break the visual hierarchy / aria-describedby).
    expect(dialog.contains(body)).toBe(true);
    expect(body.textContent).toBe('body-content-xyz');
  });
});

describe('Modal — TASK-008 AC-4: portal target is document.body', () => {
  it('TASK-008 AC-4: dialog is mounted on document.body, NOT inside the RTL render container', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} title="Portal Check">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    // kills: implementer rendering inline (no createPortal call). Inline
    // rendering breaks z-index stacking under Tailwind's transform/overflow
    // ancestors (ADR-009 rationale).
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.contains(dialog)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TASK-008 AC-5: Modal dismissal behaviour
// ---------------------------------------------------------------------------

describe('Modal — TASK-008 AC-5: Escape key closes', () => {
  it('TASK-008 AC-5: pressing Escape calls onClose exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Escape Test">
        <p>body</p>
      </Modal>,
    );
    // kills: implementer listening for the wrong key (e.g. 'Esc' vs
    // 'Escape'), forgetting to attach the keydown handler at all, or
    // attaching it inside the dialog only (which would miss key events
    // dispatched while focus is elsewhere).
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('TASK-008 AC-5: pressing a non-Escape key does NOT call onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Escape Test">
        <p>body</p>
      </Modal>,
    );
    // kills: implementer dismissing on every keydown (the `e.key === 'Escape'`
    // guard could be accidentally removed).
    await user.keyboard('a');
    await user.keyboard('{Enter}');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Modal — TASK-008 AC-5: backdrop click closes; content click does not', () => {
  // CONTRACT: the implementer marks the backdrop element with
  // data-testid="modal-backdrop". The dialog content is NOT the backdrop —
  // it sits in front of the backdrop in the stacking order, and click events
  // that originate inside the dialog must not bubble out as a backdrop click
  // (or, equivalently, the handler must check `e.target === e.currentTarget`).
  it('TASK-008 AC-5: clicking the backdrop calls onClose exactly once', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Backdrop Test">
        <p>body</p>
      </Modal>,
    );
    const backdrop = screen.getByTestId('modal-backdrop');
    // kills: implementer never wiring an onClick on the backdrop, or wiring
    // it on the wrong element (e.g. the dialog content).
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('TASK-008 AC-5: clicking inside the dialog content does NOT call onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Content Click Test">
        <p data-testid="modal-body-marker">click me</p>
      </Modal>,
    );
    const body = screen.getByTestId('modal-body-marker');
    // kills: implementer attaching the close handler to the outer wrapper
    // without a `e.target === e.currentTarget` guard, so any bubbling click
    // (including inside the dialog content) would dismiss.
    fireEvent.click(body);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TASK-008 AC-5: clicking the dialog element itself (chrome around the content) does NOT call onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Dialog Click Test">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    // The dialog is the "content" container per AC-5; clicks on its chrome
    // (padding around the body) must also NOT dismiss. kills: a slightly
    // smarter handler that exempts the immediate children of the dialog but
    // still dismisses clicks on the dialog wrapper itself.
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });
});
