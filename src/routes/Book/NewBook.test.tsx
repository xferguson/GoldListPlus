import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppRoutes } from '../../App';
import { DEFAULT_BOOK_SETTINGS } from '../../lib/defaults';
import { useAppStore } from '../../stores/useAppStore';
import { db } from '../../db/db';
import * as books from '../../db/repos/books';

// ---------------------------------------------------------------------------
// Real Dexie + fake-indexeddb. We seed and observe via the real `books` repo
// so the test reflects what the user observes (rows in the DB), not the call
// shape of an in-memory mock. The close/delete/open dance mirrors
// src/db/repos/pages.test.ts:35-47.
// ---------------------------------------------------------------------------

// Sibling probe — renders the current location.pathname as a unique testid.
// Mounted inside <MemoryRouter> alongside <AppRoutes/> so tests can observe
// route changes without spying on useNavigate.
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="probe-pathname">{location.pathname}</span>;
}

function renderAtNewBook() {
  return render(
    <MemoryRouter initialEntries={['/book/new']}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  if (db.isOpen()) {
    db.close();
  }
  await db.delete();
  await db.open();
  // Reset app store between tests so we never observe cross-test leakage.
  useAppStore.getState().setCurrentBookId(null);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (db.isOpen()) {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// TASK-010 AC-2: route registration ordering — /book/new before /book/:bookId
// ---------------------------------------------------------------------------

describe('TASK-010 AC-2: /book/new route is registered before /book/:bookId', () => {
  // kills: registering /book/new AFTER /book/:bookId, which would let the
  // param route eat the literal "new" segment (bookId = "new"). The
  // route-book marker would render instead.
  it('TASK-010 AC-2: visiting /book/new renders route-new-book, not route-book', () => {
    renderAtNewBook();
    expect(screen.getByTestId('route-new-book')).toBeInTheDocument();
    expect(screen.queryByTestId('route-book')).not.toBeInTheDocument();
  });

  // kills: registering /book/new so eagerly that it eats all /book/* (e.g.
  // path="/book/*"). The param route must still resolve for real IDs.
  it('TASK-010 AC-2: visiting /book/abc123 still renders route-book (param route not eaten)', async () => {
    renderAt('/book/abc123');
    expect(screen.getByTestId('route-book')).toBeInTheDocument();
    expect(screen.queryByTestId('route-new-book')).not.toBeInTheDocument();
    // Wait for the Book route's load effect to settle (no row for 'abc123' so
    // the empty-state and not-found marker render once books.get resolves).
    await screen.findByTestId('book-not-found');
  });
});

// ---------------------------------------------------------------------------
// TASK-010 AC-3: form initial state — all fields empty, no pre-submit errors
// ---------------------------------------------------------------------------

describe('TASK-010 AC-3: initial form state', () => {
  // kills: PRD §5.1 says fields do NOT pre-fill (pre-filling languages risks
  // silently mis-persisting locale). A regression that defaulted sourceLang
  // to "en" or targetLang to "ja" would fail here.
  it('TASK-010 AC-3: Name input is empty on first render', () => {
    renderAtNewBook();
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('TASK-010 AC-3: Source language input is empty on first render', () => {
    renderAtNewBook();
    const input = screen.getByLabelText(/source language/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('TASK-010 AC-3: Target language input is empty on first render', () => {
    renderAtNewBook();
    const input = screen.getByLabelText(/target language/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  // kills: rendering all three error nodes always-on (e.g. CSS-hidden), which
  // a screen reader / RTL would still pick up. The DOM contract is "rendered
  // only when invalid".
  it('TASK-010 AC-3: no inline error elements are in the DOM before any submit attempt', () => {
    renderAtNewBook();
    expect(screen.queryByTestId('error-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-sourceLang')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-targetLang')).not.toBeInTheDocument();
  });

  // kills: the route forgetting to render the h1 entirely, or rendering a
  // mis-cased heading. PRD §5.1 implies a visible title for the screen.
  it('TASK-010 AC-3: an h1 "New Book" is present', () => {
    renderAtNewBook();
    const heading = screen.getByRole('heading', { level: 1, name: /new book/i });
    expect(heading).toBeInTheDocument();
  });

  // kills: dropping the submit button or naming it differently
  // ("Create" / "Save" — both would be wrong; the DOM contract is exactly
  // "Create Book").
  it('TASK-010 AC-3: a submit button labelled "Create Book" is present', () => {
    renderAtNewBook();
    const button = screen.getByRole('button', { name: /create book/i });
    expect(button).toBeInTheDocument();
    expect((button as HTMLButtonElement).type).toBe('submit');
  });
});

// ---------------------------------------------------------------------------
// TASK-010 AC-4: validation — blocked submit, inline errors, error-clear
// ---------------------------------------------------------------------------

describe('TASK-010 AC-4: empty-form submit is blocked with all three inline errors', () => {
  it('TASK-010 AC-4: clicking Create Book with all fields empty does NOT write a Book row', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.click(screen.getByRole('button', { name: /create book/i }));
    // kills: a submit handler that calls books.create unconditionally and
    // relies on the DB to reject. Observe outcome (no row) rather than call shape.
    expect(await books.list()).toEqual([]);
  });

  it('TASK-010 AC-4: clicking Create Book with all fields empty does NOT navigate away from /book/new', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.click(screen.getByRole('button', { name: /create book/i }));
    // kills: navigate('/book/' + id) firing before validation completes.
    expect(screen.getByTestId('probe-pathname').textContent).toBe('/book/new');
  });

  // The three required-field errors must all appear with the *exact* copy
  // locked in the task notes. Exact text catches subtle drift (e.g.
  // "Name is required." vs "Name is required") that aria parsers and
  // screen readers would surface as different content.
  it('TASK-010 AC-4: all three error elements appear with exact text after empty submit', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.click(screen.getByRole('button', { name: /create book/i }));

    const errName = screen.getByTestId('error-name');
    expect(errName).toBeInTheDocument();
    expect(errName.textContent).toBe('Name is required');

    const errSrc = screen.getByTestId('error-sourceLang');
    expect(errSrc).toBeInTheDocument();
    expect(errSrc.textContent).toBe('Source language is required');

    const errTgt = screen.getByTestId('error-targetLang');
    expect(errTgt).toBeInTheDocument();
    expect(errTgt.textContent).toBe('Target language is required');
  });

  // kills: error nodes that aren't reachable to assistive tech (the AC requires
  // role="alert" on each so a focus-on-submit announcement works).
  it('TASK-010 AC-4: each error element has role="alert"', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.click(screen.getByRole('button', { name: /create book/i }));
    expect(screen.getByTestId('error-name').getAttribute('role')).toBe('alert');
    expect(screen.getByTestId('error-sourceLang').getAttribute('role')).toBe('alert');
    expect(screen.getByTestId('error-targetLang').getAttribute('role')).toBe('alert');
  });
});

describe('TASK-010 AC-4: partial-fill submit', () => {
  // The "only name filled" matrix row from the AC. Submit must still be
  // blocked because two required fields are empty.
  it('TASK-010 AC-4: name-only filled → error-name absent, error-sourceLang + error-targetLang present, no Book row written', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    expect(screen.queryByTestId('error-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-sourceLang')).toBeInTheDocument();
    expect(screen.getByTestId('error-targetLang')).toBeInTheDocument();
    expect(await books.list()).toEqual([]);
    expect(screen.getByTestId('probe-pathname').textContent).toBe('/book/new');
  });
});

describe('TASK-010 AC-4: typing into a field clears that field\'s error', () => {
  // kills: an implementer that runs validation only on submit and never on
  // change/blur. Without the clear-on-change behaviour the form feels broken
  // after the first failed submit.
  it('TASK-010 AC-4: typing into name clears error-name but leaves error-sourceLang/error-targetLang intact', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    // Establish all three errors first.
    await user.click(screen.getByRole('button', { name: /create book/i }));
    expect(screen.getByTestId('error-name')).toBeInTheDocument();
    expect(screen.getByTestId('error-sourceLang')).toBeInTheDocument();
    expect(screen.getByTestId('error-targetLang')).toBeInTheDocument();

    // Type into name only.
    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');

    // Only error-name has cleared.
    expect(screen.queryByTestId('error-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-sourceLang')).toBeInTheDocument();
    expect(screen.getByTestId('error-targetLang')).toBeInTheDocument();
  });

  it('TASK-010 AC-4: typing into sourceLang clears error-sourceLang but leaves the others', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.click(screen.getByRole('button', { name: /create book/i }));
    await user.type(screen.getByLabelText(/source language/i), 'en');
    expect(screen.queryByTestId('error-sourceLang')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-name')).toBeInTheDocument();
    expect(screen.getByTestId('error-targetLang')).toBeInTheDocument();
  });
});

describe('TASK-010 AC-4: whitespace-only name is treated as empty', () => {
  // kills: a validator that uses `value.length > 0` without trimming. PRD §5.1:
  // "name is trimmed and limited to 1–80 characters."
  it('TASK-010 AC-4: name "   " with both langs filled → error-name with required-copy, no Book row written', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.type(screen.getByLabelText(/^name$/i), '   ');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    const errName = screen.getByTestId('error-name');
    expect(errName).toBeInTheDocument();
    expect(errName.textContent).toBe('Name is required');
    expect(await books.list()).toEqual([]);
  });
});

describe('TASK-010 AC-4: name longer than 80 chars after trim is rejected with the length error', () => {
  // The AC explicitly notes that the input's maxLength={80} attribute usually
  // prevents typing past 80, but the validator is belt-and-braces. We force
  // the boundary by `fireEvent.change`-style direct value injection via
  // userEvent.type with a pre-trimmed-but-too-long value. userEvent honours
  // maxLength on real <input>, so we paste a value that exceeds the cap by
  // setting it directly through the React onChange path. The simplest way:
  // type 80 chars (legal), then verify the 81st is rejected by the validator
  // path that runs on trim — surrogate by using `fireEvent`-style value set.
  it('TASK-010 AC-4: 81-character name (post-trim) shows the length-error copy and blocks submit', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;

    // We want the validator to see a >80-char trimmed value even though the
    // input has maxLength=80. Strategy: bypass maxLength by removing it for
    // the duration of the keystroke run via removeAttribute, type 81 chars,
    // then submit. This mirrors a real browser race where a paste handler
    // injects a longer value, or where a future a11y tool sets value
    // imperatively.
    nameInput.removeAttribute('maxLength');
    const overlongName = 'a'.repeat(81);
    await user.type(nameInput, overlongName);
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    const errName = screen.getByTestId('error-name');
    expect(errName).toBeInTheDocument();
    // Exact copy from the locked DOM contract:
    expect(errName.textContent).toBe('Name must be 80 characters or fewer');
    expect(await books.list()).toEqual([]);
  });

  // The input element itself must declare maxLength=80 so most users never
  // hit the validator. This guards against an implementer who relies solely
  // on the JS validator and forgets the HTML safeguard.
  it('TASK-010 AC-4: name input has maxLength=80 attribute set', () => {
    renderAtNewBook();
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement;
    expect(nameInput.maxLength).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// TASK-010 AC-5: successful submit persists with defaults and navigates
// ---------------------------------------------------------------------------

describe('TASK-010 AC-5: successful submit persists with defaults and navigates', () => {
  // The matrix:
  //   - exactly one Book row written
  //   - id: 26-char ULID (matches /^[0-9A-HJKMNP-TV-Z]{26}$/)
  //   - name: trimmed
  //   - sourceLang / targetLang: trimmed
  //   - createdAt: number > 0
  //   - settings: deep-equal to DEFAULT_BOOK_SETTINGS
  //   - navigation to /book/<id>
  //   - useAppStore.currentBookId === id

  it('TASK-010 AC-5: writes exactly one Book row with the trimmed values, ULID id, and default settings', async () => {
    const user = userEvent.setup();
    renderAtNewBook();

    await user.type(screen.getByLabelText(/^name$/i), '  Japanese  ');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    // Wait for navigation + the Book route's load effect to settle (otherwise
    // React logs act() warnings as the route's useEffect resolves after the
    // test body ends).
    await screen.findByTestId('pages-empty');
    const all = await books.list();
    expect(all).toHaveLength(1);
    const persisted = all[0]!;
    // The mutation challenge: an implementer who copies the raw form values
    // (no trim) would fail the trimmed-name assertion below; an implementer
    // who uses crypto.randomUUID() (36-char with dashes) instead of newId()
    // would fail the ULID regex; an implementer who omits settings entirely
    // would fail the deep-equal.
    expect(persisted.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(persisted.name).toBe('Japanese');
    expect(persisted.sourceLang).toBe('en');
    expect(persisted.targetLang).toBe('ja');
    expect(persisted.settings).toEqual(DEFAULT_BOOK_SETTINGS);
  });

  it('TASK-010 AC-5: createdAt on the persisted row is a positive number (not a Date, not 0)', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    await screen.findByTestId('pages-empty');
    const all = await books.list();
    expect(all).toHaveLength(1);
    const persisted = all[0]!;
    // kills: passing `new Date()` (object) or omitting createdAt entirely
    // (which would be a schema violation when Dexie persists).
    expect(typeof persisted.createdAt).toBe('number');
    expect(persisted.createdAt).toBeGreaterThan(0);
  });

  // The settings deep-equal is enough on its own — but if a single autoDrop
  // flag flipped between defaults.ts and the spread into the new Book, the
  // toEqual above would fail. This is the explicit anchor.
  it('TASK-010 AC-5: persisted settings are deeply equal to DEFAULT_BOOK_SETTINGS (no per-field drift)', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    await screen.findByTestId('pages-empty');
    const all = await books.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.settings).toEqual(DEFAULT_BOOK_SETTINGS);
  });

  // PRD §5.1: "any non-empty trimmed string is accepted" — format validation
  // is explicitly deferred. This row asserts the negative: a hyphenated
  // language code is not treated as invalid.
  it('TASK-010 AC-5: language inputs are trimmed but not format-validated (hyphenated codes accepted)', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.type(screen.getByLabelText(/^name$/i), 'Test');
    await user.type(screen.getByLabelText(/source language/i), '  foo-bar-baz  ');
    await user.type(screen.getByLabelText(/target language/i), '  ja-JP  ');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    await screen.findByTestId('pages-empty');
    const all = await books.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.sourceLang).toBe('foo-bar-baz');
    expect(all[0]!.targetLang).toBe('ja-JP');
  });

  // The navigation assertion. We observe the URL via the LocationProbe rather
  // than spying on useNavigate — that way a refactor to <Navigate to=...> or
  // any other mechanism still satisfies the contract.
  it('TASK-010 AC-5: after successful submit, location.pathname is /book/<persisted-id>', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    await screen.findByTestId('pages-empty');
    const all = await books.list();
    expect(all).toHaveLength(1);
    const id = all[0]!.id;
    // kills: an implementer that navigates to /book/new (a no-op),
    // /book/undefined (forgot to read the new id), or /books/<id> (typo).
    expect(screen.getByTestId('probe-pathname').textContent).toBe(`/book/${id}`);
  });

  it('TASK-010 AC-5: after successful submit, useAppStore.currentBookId === the persisted id', async () => {
    const user = userEvent.setup();
    renderAtNewBook();
    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    await screen.findByTestId('pages-empty');
    const all = await books.list();
    expect(all).toHaveLength(1);
    const id = all[0]!.id;
    // kills: forgetting to call setCurrentBookId — downstream screens
    // (TASK-011, TASK-016) would have to repo-round-trip to learn "the Book
    // the user just created".
    expect(useAppStore.getState().currentBookId).toBe(id);
  });
});

describe('TASK-010 AC-5: rejection path keeps the form alive and surfaces error-submit', () => {
  // Force the underlying Dexie write to reject so the real books.create
  // throws. Observe outcome: no row persisted, no navigation, error alert.
  it('TASK-010 AC-5: if the underlying write rejects, no Book row is persisted and no navigation occurs', async () => {
    vi.spyOn(db.books, 'add').mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    renderAtNewBook();

    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    // Wait for the error alert to confirm the rejection has been handled.
    await screen.findByTestId('error-submit');

    // No row was persisted.
    expect(await books.list()).toEqual([]);
    // kills: an optimistic-navigation pattern that navigates before awaiting
    // books.create, then leaves the user on a broken /book/<id> page when
    // the write fails.
    expect(screen.getByTestId('probe-pathname').textContent).toBe('/book/new');

    // Form values are retained (so the user can retry without re-typing).
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('Japanese');
    expect((screen.getByLabelText(/source language/i) as HTMLInputElement).value).toBe('en');
    expect((screen.getByLabelText(/target language/i) as HTMLInputElement).value).toBe('ja');
  });

  it('TASK-010 AC-5: if the underlying write rejects, an error-submit alert is rendered', async () => {
    vi.spyOn(db.books, 'add').mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    renderAtNewBook();

    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    // kills: a silent rejection-swallowing handler (the user would think
    // the click did nothing). The locked contract is "error-submit" with
    // role="alert" so screen readers announce it.
    const errSubmit = await screen.findByTestId('error-submit');
    expect(errSubmit).toBeInTheDocument();
    expect(errSubmit.getAttribute('role')).toBe('alert');
    // No row should have been written.
    expect(await books.list()).toEqual([]);
  });

  it('TASK-010 AC-5: if the underlying write rejects, useAppStore.currentBookId stays null', async () => {
    vi.spyOn(db.books, 'add').mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    renderAtNewBook();

    await user.type(screen.getByLabelText(/^name$/i), 'Japanese');
    await user.type(screen.getByLabelText(/source language/i), 'en');
    await user.type(screen.getByLabelText(/target language/i), 'ja');
    await user.click(screen.getByRole('button', { name: /create book/i }));

    await screen.findByTestId('error-submit');
    // kills: an implementer who sets currentBookId before awaiting
    // books.create, leaving the store pointing at a Book that never made
    // it to disk.
    expect(useAppStore.getState().currentBookId).toBeNull();
    expect(await books.list()).toEqual([]);
  });
});
