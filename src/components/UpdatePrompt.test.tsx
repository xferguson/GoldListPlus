import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// virtual:pwa-register/react mock
//
// The component under test imports `useRegisterSW` from this virtual module
// (ADR-013). The virtual module only resolves at vite build time and would
// throw under vitest without this mock.
//
// CONTRACT to the Implementer: the production `UpdatePrompt.tsx` MUST call
//   const { needRefresh: [needRefresh, setNeedRefresh],
//           offlineReady: [offlineReady, setOfflineReady],
//           updateServiceWorker } = useRegisterSW({ ... });
// using the `useRegisterSW` import below. The mock's return value mirrors the
// real hook's tuple-state shape so the component can destructure it normally.
//
// Tests configure `mockNeedRefreshState` before render to control needRefresh.
// `mockUpdateServiceWorker` is a `vi.fn()` so tests can assert call counts +
// arguments. Both are reset in beforeEach so tests cannot bleed state.
// ---------------------------------------------------------------------------

const mockUpdateServiceWorker = vi.fn();
let mockNeedRefresh = false;
const mockSetNeedRefresh = vi.fn((value: boolean | ((v: boolean) => boolean)) => {
  mockNeedRefresh = typeof value === 'function' ? value(mockNeedRefresh) : value;
});

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [mockNeedRefresh, mockSetNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: mockUpdateServiceWorker,
  }),
}));

// Defer the import so the mock above is hoisted before the component module
// is evaluated.
import { UpdatePrompt } from './UpdatePrompt';

beforeEach(() => {
  mockNeedRefresh = false;
  mockUpdateServiceWorker.mockReset();
  mockSetNeedRefresh.mockReset();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// TASK-021 AC-3: Update toast renders a reload-themed action.
// ---------------------------------------------------------------------------

describe('UpdatePrompt — TASK-021 AC-3: visibility gated on needRefresh', () => {
  it('TASK-021 AC-3: when needRefresh=false, renders no live-region toast and no reload button', () => {
    mockNeedRefresh = false;
    render(<UpdatePrompt />);

    // kills: implementer forgetting the `if (!needRefresh) return null` guard
    // and always rendering the toast. The toast would then appear on every page
    // load and pester the user even when no update is waiting — a direct
    // violation of ADR-013's "non-blocking, user-initiated" contract.
    const reloadCandidates = screen.queryAllByRole('button', { name: /reload/i });
    expect(reloadCandidates).toHaveLength(0);

    // Extra mutation guard: even if the implementer renders the container with
    // role="status" but no button, the *toast* shouldn't be live-announced
    // when no update is pending. Workbox-side this is also relevant: a noisy
    // live region on every load is bad a11y.
    const statusLandmarks = screen.queryAllByRole('status');
    const alertLandmarks = screen.queryAllByRole('alert');
    expect(statusLandmarks.length + alertLandmarks.length).toBe(0);
  });

  it('TASK-021 AC-3: when needRefresh=true, renders a live-region landmark with a button matching /reload/i', () => {
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    // kills: implementer rendering the button but skipping role="status" /
    // role="alert". The toast must be announced to screen readers — colour /
    // position alone is not an a11y signal.
    const statusLandmarks = screen.queryAllByRole('status');
    const alertLandmarks = screen.queryAllByRole('alert');
    expect(statusLandmarks.length + alertLandmarks.length).toBeGreaterThanOrEqual(1);

    // kills: implementer naming the button "Refresh" or "Activate" or
    // "Update" with no "reload" verb. AC-3 pins the regex; the user must read
    // a reload-themed verb so the consequence is obvious.
    const reloadBtn = screen.getByRole('button', { name: /reload/i });
    expect(reloadBtn).toBeInTheDocument();
  });

  it('TASK-021 AC-3: the reload button is INSIDE a live-region landmark (not a sibling)', () => {
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    const reloadBtn = screen.getByRole('button', { name: /reload/i });
    const liveRegion =
      reloadBtn.closest('[role="status"]') ?? reloadBtn.closest('[role="alert"]');

    // kills: implementer mounting the live region adjacent to the button. The
    // announcement must include the call-to-action so screen-reader users
    // know what to do, not just "an update is ready".
    expect(liveRegion).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TASK-021 AC-4: Update toast exposes a dismiss control.
// ---------------------------------------------------------------------------

describe('UpdatePrompt — TASK-021 AC-4: dismiss control present and distinct', () => {
  it('TASK-021 AC-4: when needRefresh=true, a second control matches /dismiss|not now|later|close/i', () => {
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    const dismissBtn = screen.getByRole('button', { name: /dismiss|not now|later|close/i });
    // kills: implementer offering only the reload button. Without a dismiss
    // control the user cannot defer the update, contradicting ADR-013's
    // "dismissal hides the toast for the session" promise.
    expect(dismissBtn).toBeInTheDocument();
  });

  it('TASK-021 AC-4: the dismiss control is a DIFFERENT element from the reload control', () => {
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    const reloadBtn = screen.getByRole('button', { name: /reload/i });
    const dismissBtn = screen.getByRole('button', { name: /dismiss|not now|later|close/i });

    // kills: implementer wiring one button with text that satisfies both
    // regexes (e.g. "Reload now or close"), collapsing reload + dismiss into
    // a single ambiguous action. The two controls must be distinct DOM nodes.
    expect(reloadBtn).not.toBe(dismissBtn);
  });
});

// ---------------------------------------------------------------------------
// TASK-021 AC-5: No auto-reload. updateServiceWorker is called only on click.
// ---------------------------------------------------------------------------

describe('UpdatePrompt — TASK-021 AC-5: no auto-reload on mount', () => {
  it('TASK-021 AC-5: rendering with needRefresh=true does NOT call updateServiceWorker on mount', async () => {
    mockNeedRefresh = true;
    render(<UpdatePrompt />);
    // Microtask flush — catches an implementer wiring updateServiceWorker via
    // a `useEffect(() => { updateServiceWorker(true); }, [needRefresh])` that
    // would silently activate the new SW the moment the toast appears.
    await Promise.resolve();

    // kills: implementer auto-activating on mount (ADR-013 forbids silent
    // mid-session reloads — that is precisely what `registerType: 'prompt'`
    // existed to avoid).
    expect(mockUpdateServiceWorker).not.toHaveBeenCalled();
  });

  it('TASK-021 AC-5: clicking reload calls updateServiceWorker EXACTLY once', async () => {
    const user = userEvent.setup();
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    const reloadBtn = screen.getByRole('button', { name: /reload/i });
    await user.click(reloadBtn);

    // kills: implementer attaching the handler twice (e.g. onClick + form
    // submit), or attaching it inside a useEffect that re-fires on every
    // render. We want exactly one activation per user click.
    expect(mockUpdateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('TASK-021 AC-5: clicking reload calls updateServiceWorker with argument true (NOT undefined, NOT false)', async () => {
    const user = userEvent.setup();
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    const reloadBtn = screen.getByRole('button', { name: /reload/i });
    await user.click(reloadBtn);

    // kills: implementer calling `updateServiceWorker()` (no arg) or
    // `updateServiceWorker(false)`. Per vite-plugin-pwa docs the `true`
    // argument is what triggers skipWaiting + reload; without it the new SW
    // installs but the page does not refresh, and the user thinks the
    // button is broken.
    expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// TASK-021 AC-6: Dismissal hides toast without activating SW.
// ---------------------------------------------------------------------------

describe('UpdatePrompt — TASK-021 AC-6: dismiss hides toast without calling updateServiceWorker', () => {
  it('TASK-021 AC-6: after clicking dismiss, the reload button is removed from the DOM', async () => {
    const user = userEvent.setup();
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: /dismiss|not now|later|close/i });
    await user.click(dismissBtn);

    // kills: implementer wiring dismiss to do nothing visible. The toast must
    // actually disappear or the user has no feedback that the dismissal
    // registered, and would keep clicking it.
    expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument();
  });

  it('TASK-021 AC-6: clicking dismiss does NOT call updateServiceWorker', async () => {
    const user = userEvent.setup();
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    const dismissBtn = screen.getByRole('button', { name: /dismiss|not now|later|close/i });
    await user.click(dismissBtn);
    await Promise.resolve();

    // kills: implementer wiring dismiss to also call updateServiceWorker (e.g.
    // confusing the two buttons in a copy-paste). ADR-013's whole point is
    // that dismissal defers reactivation — calling updateServiceWorker here
    // would reload the page despite the user choosing "not now".
    expect(mockUpdateServiceWorker).not.toHaveBeenCalled();
  });

  it('TASK-021 AC-6: clicking dismiss also removes the dismiss control itself (whole toast hides)', async () => {
    const user = userEvent.setup();
    mockNeedRefresh = true;
    render(<UpdatePrompt />);

    const dismissBtn = screen.getByRole('button', { name: /dismiss|not now|later|close/i });
    await user.click(dismissBtn);

    // kills: implementer hiding the reload button but leaving the dismiss
    // button (or the live region) visible — a half-collapsed toast is worse
    // UX than no dismissal at all.
    expect(
      screen.queryByRole('button', { name: /dismiss|not now|later|close/i }),
    ).not.toBeInTheDocument();

    const liveRegions = [
      ...screen.queryAllByRole('status'),
      ...screen.queryAllByRole('alert'),
    ];
    expect(liveRegions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mutation guard: in-session dismiss-stickiness (PRD §5.12 / ADR-013).
//
// Once the user dismisses in a session, the toast should NOT pop back up
// without a new needRefresh event — otherwise dismissal accomplishes nothing
// because the next render re-shows it. The implementer must keep dismissed
// state locally inside the component.
// ---------------------------------------------------------------------------

describe('UpdatePrompt — dismiss-stickiness (ADR-013 / PRD §5.12)', () => {
  it('after dismissal, a re-render with needRefresh still true does NOT re-show the toast', async () => {
    const user = userEvent.setup();
    mockNeedRefresh = true;
    const { rerender } = render(<UpdatePrompt />);

    const dismissBtn = screen.getByRole('button', { name: /dismiss|not now|later|close/i });
    await user.click(dismissBtn);
    expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument();

    // Force a re-render with the hook still reporting needRefresh=true. This
    // simulates a parent re-render (route change, layout repaint, etc.) while
    // the new SW is still waiting.
    mockNeedRefresh = true;
    rerender(<UpdatePrompt />);

    // kills: implementer reading `needRefresh` from the hook on every render
    // without maintaining a local `dismissed` flag. Without local state, the
    // toast re-appears the moment anything triggers a parent re-render, which
    // makes the dismiss button feel broken.
    expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument();
  });
});
