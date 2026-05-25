import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useParams } from 'react-router-dom';
import { Book } from './index';
import { tierVisual } from '../../lib/tiers';
import type { Book as BookType, Page } from '../../db/db';
import { db } from '../../db/db';
import * as books from '../../db/repos/books';
import * as pages from '../../db/repos/pages';
import { MS_PER_DAY } from '../../lib/time';

// ---------------------------------------------------------------------------
// Real Dexie + fake-indexeddb. We seed via books.create / pages.create and
// observe via the real repo queries. The close/delete/open dance mirrors
// src/db/repos/pages.test.ts:35-47.
// ---------------------------------------------------------------------------

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
    reviewableAt: 1_700_000_000_000 + 14 * MS_PER_DAY,
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

beforeEach(async () => {
  if (db.isOpen()) {
    db.close();
  }
  await db.delete();
  await db.open();
  // Default seed: a single Book matching 'book-1' so the route renders with a
  // name. Individual tests seed Pages (or override the Book) before rendering.
  await books.create(makeBook());
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (db.isOpen()) {
    db.close();
  }
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
    await pages.create(makePage({ id: 'p1', title: 'Bronze 1', createdAt: 1000 }));
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

  it('AC-3b: clicking the button writes exactly one new Page row', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    // Wait for navigation so the create has resolved before we read back.
    await screen.findByTestId('route-list-detail-probe');
    expect(await pages.listByBook('book-1')).toHaveLength(1);
  });

  it('AC-3b: the persisted Page has a 26-char ULID id', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-1');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('AC-3b: the persisted Page has bookId === route param', async () => {
    // The route reads bookId from useParams (NOT from useAppStore), and the
    // persisted Page must carry that exact bookId.
    await books.create(makeBook({ id: 'book-XYZ' }));
    const user = userEvent.setup();
    renderRoute('book-XYZ');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-XYZ');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.bookId).toBe('book-XYZ');
    // false-positive guard: nothing leaked into book-1.
    expect(await pages.listByBook('book-1')).toHaveLength(0);
  });

  it('AC-3b: the persisted Page has tier === "bronze" and cardIds === []', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-1');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.tier).toBe('bronze');
    expect(persisted[0]!.cardIds).toEqual([]);
  });

  it('AC-3b: the persisted Page has title === "Bronze 1" when no existing Bronze pages', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-1');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.title).toBe('Bronze 1');
  });

  it('AC-3b: createdAt on the persisted Page is a positive number (real time, not 0)', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-1');
    expect(persisted).toHaveLength(1);
    expect(typeof persisted[0]!.createdAt).toBe('number');
    expect(persisted[0]!.createdAt).toBeGreaterThan(0);
  });

  it('AC-3b: reviewableAt === createdAt + distillationIntervalDays*MS_PER_DAY — with 7-day fixture (kills hardcoded 14)', async () => {
    // The single most discriminating assertion in this file. A 14-day default
    // hardcode would yield reviewableAt - createdAt = 14*MS_PER_DAY; we set
    // the fixture to 7 days so a regression that ignored book.settings and
    // hardcoded 14 would fail this exact equality.
    // Replace the default Book with one whose interval is 7.
    await books.update('book-1', {
      settings: {
        distillationIntervalDays: 7,
        headlistSize: 25,
        autoDropOnHard: false,
        autoDropOnModerate: true,
        autoDropOnEasy: true,
      },
    });
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-1');
    expect(persisted).toHaveLength(1);
    const row = persisted[0]!;
    expect(row.reviewableAt).not.toBeNull();
    // Computed equality. Sentinel — discriminates 7 from 14.
    expect((row.reviewableAt as number) - row.createdAt).toBe(7 * MS_PER_DAY);
  });

  it('AC-3b: reviewedAt === undefined on the persisted Page', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-1');
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.reviewedAt).toBeUndefined();
  });

  it('AC-3c: after the new Bronze List is persisted, navigation lands on /list/<persisted-id>', async () => {
    const user = userEvent.setup();
    renderRoute('book-1');
    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    // The probe receives the pageId param when /list/:pageId is matched.
    const probe = await screen.findByTestId('route-list-detail-probe');
    const persisted = await pages.listByBook('book-1');
    expect(persisted).toHaveLength(1);
    const newId = persisted[0]!.id;
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
  it('AC-4a: Book with ["Bronze 1","Bronze 3"] → click → new Page persisted with title === "Bronze 2"', async () => {
    await pages.create(makePage({ id: 'p1', title: 'Bronze 1', createdAt: 1000 }));
    await pages.create(makePage({ id: 'p3', title: 'Bronze 3', createdAt: 3000 }));
    const user = userEvent.setup();
    renderRoute('book-1');
    // Wait for the existing pages to render so the click's reuse-search runs
    // against the loaded list.
    await screen.findByTestId('page-row-p1');

    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const all = await pages.listByBook('book-1');
    // kills: length+1 (would give "Bronze 3"), max+1 (would give "Bronze 4"),
    // monotonic counter (likely "Bronze 4" or undefined).
    const newRow = all.find((p) => p.id !== 'p1' && p.id !== 'p3');
    expect(newRow).toBeDefined();
    expect(newRow!.title).toBe('Bronze 2');
  });

  it('AC-4b: Book with only ["Silver 1"] → click → title === "Bronze 1" (non-Bronze ignored)', async () => {
    await pages.create(makePage({ id: 'p1', title: 'Silver 1', tier: 'silver', createdAt: 1000 }));
    const user = userEvent.setup();
    renderRoute('book-1');
    await screen.findByTestId('page-row-p1');

    await user.click(await screen.findByRole('button', { name: /new bronze list/i }));

    await screen.findByTestId('route-list-detail-probe');
    const all = await pages.listByBook('book-1');
    const newRow = all.find((p) => p.id !== 'p1');
    expect(newRow).toBeDefined();
    // kills: counting all pages regardless of tier (would give "Bronze 2").
    expect(newRow!.title).toBe('Bronze 1');
  });
});

// ===========================================================================
// AC-5: Existing-Lists rendering — ordering, link href, tier primitives
// ===========================================================================

describe('TASK-011 AC-5: per-Book overview — existing-Lists rendering', () => {
  it('AC-5a: DOM order of page-row-* matches createdAt-desc — non-monotonic fixture', async () => {
    // Fixture deliberately non-monotonic in id-order so a naive sort by id
    // (or insertion order) would fail.
    await pages.create(makePage({ id: 'first', title: 'Bronze 1', createdAt: 1000 }));
    await pages.create(makePage({ id: 'last', title: 'Bronze 2', createdAt: 3000 }));
    await pages.create(makePage({ id: 'middle', title: 'Bronze 3', createdAt: 2000 }));
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
    await pages.create(makePage({ id: 'abc', title: 'Bronze 1', createdAt: 1000 }));
    await pages.create(makePage({ id: 'def', title: 'Bronze 2', createdAt: 2000 }));
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
    await pages.create(makePage({ id: 'bronzed', title: 'Bronze 1', tier: 'bronze', createdAt: 1000 }));
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
    await pages.create(makePage({ id: 'bronzed', title: 'Bronze 1', tier: 'bronze', createdAt: 1000 }));
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
    await pages.create(makePage({ id: 'silvered', title: 'Silver 1', tier: 'silver', createdAt: 1000 }));
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
    renderRoute('book-1');

    const empty = await screen.findByTestId('pages-empty');
    // Anchored regex: kills any drift in punctuation, casing, word order.
    expect(empty.textContent ?? '').toMatch(
      /^No lists yet\. Create your first Bronze List to start\.$/,
    );
  });

  it('AC-6b: empty-state is NOT in the DOM when at least one Page exists', async () => {
    await pages.create(makePage({ id: 'x', title: 'Bronze 1', createdAt: 1000 }));
    renderRoute('book-1');
    // Wait for the list to render so the await is not racey.
    await screen.findByTestId('pages-list');
    expect(screen.queryByTestId('pages-empty')).not.toBeInTheDocument();
  });

  it('AC-6c: New-Bronze-List button is present regardless of empty state — empty case', async () => {
    renderRoute('book-1');
    expect(
      await screen.findByRole('button', { name: /new bronze list/i }),
    ).toBeInTheDocument();
  });

  it('AC-6c: New-Bronze-List button is present regardless of empty state — non-empty case', async () => {
    await pages.create(makePage({ id: 'x', title: 'Bronze 1', createdAt: 1000 }));
    renderRoute('book-1');
    expect(
      await screen.findByRole('button', { name: /new bronze list/i }),
    ).toBeInTheDocument();
  });

  it('AC-6: book h1 reflects books.get(bookId).name', async () => {
    // Architectural note: the route reads bookId from useParams and renders
    // the Book name as <h1>. A regression that displayed bookId or "Book"
    // as a placeholder would fail.
    // Reseed the default Book under a different name. The default seed in
    // beforeEach gave it "Japanese"; replace via books.update.
    await books.update('book-1', { name: 'Polish' });
    renderRoute('book-1');
    const h1 = await screen.findByRole('heading', { level: 1, name: /polish/i });
    expect(h1).toBeInTheDocument();
  });
});
