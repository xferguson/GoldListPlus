import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useParams } from 'react-router-dom';
import { Book } from './index';
import { tierVisual } from '../../lib/tiers';
import type { Book as BookType, Page } from '../../db/db';
import * as books from '../../db/repos/books';
import * as pages from '../../db/repos/pages';

// ---------------------------------------------------------------------------
// Mock the two repos the Book route reads. vi.mock is hoisted, so the path
// matches what the SUT imports (from src/routes/Book/index.tsx → '../../db/repos/...').
// ---------------------------------------------------------------------------

vi.mock('../../db/repos/books', () => ({
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../db/repos/pages', () => ({
  create: vi.fn(),
  get: vi.fn(),
  listByBook: vi.fn(),
  listDue: vi.fn(),
  finalize: vi.fn(),
  update: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBook(overrides: Partial<BookType> = {}): BookType {
  return {
    id: 'book-1',
    name: 'Japanese',
    sourceLang: 'en',
    targetLang: 'ja',
    createdAt: 1_700_000_000_000,
    settings: {
      distillationIntervalDays: 14,
      headlistSize: 25,
      autoDropOnHard: false,
      autoDropOnModerate: true,
      autoDropOnEasy: true,
    },
    ...overrides,
  };
}

function makePage(overrides: Partial<Page>): Page {
  return {
    id: 'page-1',
    bookId: 'book-1',
    title: 'Bronze 1',
    tier: 'bronze',
    createdAt: 1_700_000_000_000,
    reviewableAt: 1_700_000_000_000 + 14 * 86_400_000,
    cardIds: [],
    ...overrides,
  };
}

// Sibling probe component for navigation assertions. We render a /list/:pageId
// route in the route table so a navigate('/list/<id>') call lands somewhere
// the test can observe deterministically.
function ListProbe() {
  const { pageId } = useParams<{ pageId: string }>();
  return <span data-testid="route-list-detail-probe">{pageId ?? ''}</span>;
}

function PathnameProbe() {
  const loc = useLocation();
  return <span data-testid="probe-pathname">{loc.pathname}</span>;
}

function renderRoute(bookId: string) {
  return render(
    <MemoryRouter initialEntries={[`/book/${bookId}`]}>
      <Routes>
        <Route path="/book/:bookId" element={<Book />} />
        <Route path="/list/:pageId" element={<ListProbe />} />
      </Routes>
      <PathnameProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(books.get).mockReset();
  vi.mocked(pages.create).mockReset();
  vi.mocked(pages.listByBook).mockReset();

  // Default behaviour: a Book exists, no pages, create resolves.
  vi.mocked(books.get).mockResolvedValue(makeBook());
  vi.mocked(pages.listByBook).mockResolvedValue([]);
  vi.mocked(pages.create).mockResolvedValue(undefined);
});

// ===========================================================================
// AC-3: New-Bronze-List affordance
// ===========================================================================

describe('TASK-011 AC-3: per-Book overview — New-Bronze-List affordance', () => {
  it('AC-3a: button with name /new bronze list/i is present when Book has zero Pages', async () => {
    renderRoute('book-1');
    // kills: rendering the button only conditionally (e.g. only when pages > 0).
    expect(
      await screen.findByRole('button', { name: /new bronze list/i }),
    ).toBeInTheDocument();
  });

  it('AC-3a: button is also present when Book already has Pages (affordance independent of empty state)', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'p1', title: 'Bronze 1', createdAt: 1000 }),
    ]);
    renderRoute('book-1');
    expect(
      await screen.findByRole('button', { name: /new bronze list/i }),
    ).toBeInTheDocument();
  });

  it('AC-3a: button has data-testid="new-bronze-list" (locked selector)', async () => {
    renderRoute('book-1');
    const btn = await screen.findByTestId('new-bronze-list');
    expect(btn.tagName).toBe('BUTTON');
    // kills: a <Link>-only affordance — the architectural note locks <button>
    // because the click has a side effect (creates a row) before navigating.
    expect((btn as HTMLButtonElement).type).toBe('button');
  });

  it('AC-3b: clicking the button calls pages.create exactly once', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    expect(pages.create).toHaveBeenCalledTimes(1);
  });

  it('AC-3b: pages.create is called with a 26-char ULID id', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    expect(pages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      }),
    );
  });

  it('AC-3b: pages.create is called with bookId === route param', async () => {
    const user = userEvent.setup();
    renderRoute('book-XYZ');
    vi.mocked(books.get).mockResolvedValue(makeBook({ id: 'book-XYZ' }));
    // Re-render — the mock change above is for any subsequent calls, but
    // the initial render already started. Easiest: re-await listByBook.
    // Since listByBook default returns [], the page renders. The route reads
    // bookId from useParams (NOT from useAppStore), and pages.create must
    // receive that exact value.
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    expect(pages.create).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: 'book-XYZ' }),
    );
  });

  it('AC-3b: pages.create is called with tier === "bronze" and cardIds === []', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    const arg = vi.mocked(pages.create).mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg!.tier).toBe('bronze');
    expect(arg!.cardIds).toEqual([]);
  });

  it('AC-3b: pages.create is called with title === "Bronze 1" when no existing Bronze pages', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    expect(pages.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Bronze 1' }),
    );
  });

  it('AC-3b: createdAt is a positive number (real time, not 0)', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    const arg = vi.mocked(pages.create).mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(typeof arg!.createdAt).toBe('number');
    expect(arg!.createdAt).toBeGreaterThan(0);
  });

  it('AC-3b: reviewableAt === createdAt + distillationIntervalDays*86_400_000 — with 7-day fixture (kills hardcoded 14)', async () => {
    // The single most discriminating assertion in this file. A 14-day default
    // hardcode would yield reviewableAt - createdAt = 14*86_400_000; we set
    // the fixture to 7 days so a regression that ignored book.settings and
    // hardcoded 14 would fail this exact equality.
    vi.mocked(books.get).mockResolvedValue(
      makeBook({
        settings: {
          distillationIntervalDays: 7,
          headlistSize: 25,
          autoDropOnHard: false,
          autoDropOnModerate: true,
          autoDropOnEasy: true,
        },
      }),
    );
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    const arg = vi.mocked(pages.create).mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg!.reviewableAt).not.toBeNull();
    // Computed equality. Sentinel — discriminates 7 from 14.
    expect((arg!.reviewableAt as number) - arg!.createdAt).toBe(7 * 86_400_000);
  });

  it('AC-3b: reviewedAt === undefined on creation', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    const arg = vi.mocked(pages.create).mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg!.reviewedAt).toBeUndefined();
  });

  it('AC-3c: after pages.create resolves, navigation lands on /list/<that-same-id>', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    const arg = vi.mocked(pages.create).mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    const newId = arg!.id;

    // The probe receives the pageId param when /list/:pageId is matched.
    const probe = await screen.findByTestId('route-list-detail-probe');
    expect(probe.textContent).toBe(newId);
    // And the pathname matches.
    expect(screen.getByTestId('probe-pathname').textContent).toBe(`/list/${newId}`);
  });

  it('AC-3d: no intermediate `route-new-bronze-list` testid appears between click and navigation', async () => {
    // The PRD §5.2.1 contract is "creates the List immediately with no
    // intermediate form". A regression that introduced a confirm-modal or
    // intermediate route would be visible via this testid (or any plausibly
    // named intermediate marker). We assert the negative both before and
    // after the click.
    const user = userEvent.setup();
    renderRoute('book-1');
    expect(screen.queryByTestId('route-new-bronze-list')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));
    expect(screen.queryByTestId('route-new-bronze-list')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// AC-4: Gap-reuse on second create / non-Bronze ignored
// ===========================================================================

describe('TASK-011 AC-4: per-Book overview — gap-reuse on subsequent create', () => {
  it('AC-4a: Book with ["Bronze 1","Bronze 3"] → click → pages.create with title === "Bronze 2"', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'p1', title: 'Bronze 1', createdAt: 1000 }),
      makePage({ id: 'p3', title: 'Bronze 3', createdAt: 3000 }),
    ]);
    const user = userEvent.setup();
    renderRoute('book-1');

    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    // kills: length+1 (would give "Bronze 3"), max+1 (would give "Bronze 4"),
    // monotonic counter (likely "Bronze 4" or undefined).
    expect(pages.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Bronze 2' }),
    );
  });

  it('AC-4b: Book with only ["Silver 1"] → click → title === "Bronze 1" (non-Bronze ignored)', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'p1', title: 'Silver 1', tier: 'silver', createdAt: 1000 }),
    ]);
    const user = userEvent.setup();
    renderRoute('book-1');

    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    // kills: counting all pages regardless of tier (would give "Bronze 2").
    expect(pages.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Bronze 1' }),
    );
  });
});

// ===========================================================================
// AC-5: Existing-Lists rendering — ordering, link href, tier primitives
// ===========================================================================

describe('TASK-011 AC-5: per-Book overview — existing-Lists rendering', () => {
  it('AC-5a: DOM order of page-row-* matches createdAt-desc — non-monotonic fixture', async () => {
    // Fixture deliberately non-monotonic in id-order so a naive sort by id
    // (or insertion order) would fail.
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'first', title: 'Bronze 1', createdAt: 1000 }),
      makePage({ id: 'last', title: 'Bronze 2', createdAt: 3000 }),
      makePage({ id: 'middle', title: 'Bronze 3', createdAt: 2000 }),
    ]);
    renderRoute('book-1');

    // findAllByTestId would match prefix only with regex; use querySelectorAll
    // on the rendered DOM via screen.findByTestId for the list container.
    await screen.findByTestId('pages-list');
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid^="page-row-"]'),
    );
    // kills: ascending-by-createdAt (would give [first, middle, last]),
    // insertion-order preservation (would give [first, last, middle]).
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'page-row-last',
      'page-row-middle',
      'page-row-first',
    ]);
  });

  it('AC-5b: each row has a link with href ending in #/list/<pageId> (HashRouter form)', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'abc', title: 'Bronze 1', createdAt: 1000 }),
      makePage({ id: 'def', title: 'Bronze 2', createdAt: 2000 }),
    ]);
    renderRoute('book-1');
    await screen.findByTestId('pages-list');

    // Each row's <a> must end with /list/<id>. The HashRouter prefix is "#/"
    // when wrapped in HashRouter; MemoryRouter renders without the "#".
    // The locked DOM contract says href={`#/list/${pageId}`} (string literal).
    const a1 = screen.getByTestId('page-link-abc') as HTMLAnchorElement;
    const a2 = screen.getByTestId('page-link-def') as HTMLAnchorElement;
    expect(a1.getAttribute('href')).toMatch(/#\/list\/abc$/);
    expect(a2.getAttribute('href')).toMatch(/#\/list\/def$/);
  });

  it('AC-5c: bronze row contains an element with the bronze borderClass substring', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'bronzed', title: 'Bronze 1', tier: 'bronze', createdAt: 1000 }),
    ]);
    renderRoute('book-1');
    const row = await screen.findByTestId('page-row-bronzed');
    const bronzeBorder = tierVisual('bronze').borderClass;
    // substring match (not exact). kills: a row that drops the TierBorder
    // wrapper entirely, or uses a generic `border-gray-400`.
    const hasBronzeBorder = Array.from(row.querySelectorAll('*')).some((el) =>
      (el.getAttribute('class') ?? '').includes(bronzeBorder),
    );
    expect(hasBronzeBorder).toBe(true);
  });

  it('AC-5c: bronze row contains a role="status" element with aria-label === "Bronze"', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'bronzed', title: 'Bronze 1', tier: 'bronze', createdAt: 1000 }),
    ]);
    renderRoute('book-1');
    const row = await screen.findByTestId('page-row-bronzed');
    const badge = within(row).getByRole('status');
    expect(badge.getAttribute('aria-label')).toBe('Bronze');
  });

  it('AC-5c: silver row uses the silver borderClass and aria-label="Silver" (kills hardcoded-bronze regression)', async () => {
    // This is the false-positive row for the tier-mapping. A row with a
    // silver Page must render the silver primitives, not bronze. Without
    // this assertion a hardcoded `<TierBorder tier="bronze">` would slip
    // past AC-5c's bronze check.
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'silvered', title: 'Silver 1', tier: 'silver', createdAt: 1000 }),
    ]);
    renderRoute('book-1');
    const row = await screen.findByTestId('page-row-silvered');
    const silverBorder = tierVisual('silver').borderClass;
    const bronzeBorder = tierVisual('bronze').borderClass;

    const hasSilverBorder = Array.from(row.querySelectorAll('*')).some((el) =>
      (el.getAttribute('class') ?? '').includes(silverBorder),
    );
    const hasBronzeBorder = Array.from(row.querySelectorAll('*')).some((el) =>
      (el.getAttribute('class') ?? '').includes(bronzeBorder),
    );
    expect(hasSilverBorder).toBe(true);
    expect(hasBronzeBorder).toBe(false);

    const badge = within(row).getByRole('status');
    expect(badge.getAttribute('aria-label')).toBe('Silver');
  });
});

// ===========================================================================
// AC-6: Empty state
// ===========================================================================

describe('TASK-011 AC-6: per-Book overview — empty state', () => {
  it('AC-6a: zero Pages → getByTestId("pages-empty") text matches exact copy', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([]);
    renderRoute('book-1');

    const empty = await screen.findByTestId('pages-empty');
    // Anchored regex: kills any drift in punctuation, casing, word order.
    expect(empty.textContent ?? '').toMatch(
      /^No lists yet\. Create your first Bronze List to start\.$/,
    );
  });

  it('AC-6b: empty-state is NOT in the DOM when at least one Page exists', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'x', title: 'Bronze 1', createdAt: 1000 }),
    ]);
    renderRoute('book-1');
    // Wait for the list to render so the await is not racey.
    await screen.findByTestId('pages-list');
    expect(screen.queryByTestId('pages-empty')).not.toBeInTheDocument();
  });

  it('AC-6c: New-Bronze-List button is present regardless of empty state — empty case', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([]);
    renderRoute('book-1');
    expect(
      await screen.findByRole('button', { name: /new bronze list/i }),
    ).toBeInTheDocument();
  });

  it('AC-6c: New-Bronze-List button is present regardless of empty state — non-empty case', async () => {
    vi.mocked(pages.listByBook).mockResolvedValue([
      makePage({ id: 'x', title: 'Bronze 1', createdAt: 1000 }),
    ]);
    renderRoute('book-1');
    expect(
      await screen.findByRole('button', { name: /new bronze list/i }),
    ).toBeInTheDocument();
  });

  it('AC-6: book h1 reflects books.get(bookId).name', async () => {
    // Architectural note: the route reads bookId from useParams and renders
    // the Book name as <h1>. A regression that displayed bookId or "Book"
    // as a placeholder would fail.
    vi.mocked(books.get).mockResolvedValue(makeBook({ name: 'Polish' }));
    renderRoute('book-1');
    const h1 = await screen.findByRole('heading', { level: 1, name: /polish/i });
    expect(h1).toBeInTheDocument();
  });
});
