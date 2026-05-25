import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ListDetail } from './index';
import { tierVisual } from '../../lib/tiers';
import type { Card, Page } from '../../db/db';
import * as pages from '../../db/repos/pages';
import * as cards from '../../db/repos/cards';
import { MS_PER_DAY } from '../../lib/time';

// Source-level scan target for AC-16 (no localStorage / sessionStorage).
const LISTDETAIL_SOURCE_MODULES = import.meta.glob('./index.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const LISTDETAIL_SOURCE: string = LISTDETAIL_SOURCE_MODULES['./index.tsx'] ?? '';

// Stateful fakes back the route's read-after-write flow (create → update →
// re-read) so DOM updates after each mutation are observable in jsdom.
vi.mock('../../db/repos/pages', () => ({
  create: vi.fn(),
  get: vi.fn(),
  listByBook: vi.fn(),
  listDue: vi.fn(),
  finalize: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../../db/repos/cards', () => ({
  create: vi.fn(),
  get: vi.fn(),
  listByPage: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

type Store = { pages: Map<string, Page>; cards: Map<string, Card> };
let store: Store;

beforeEach(() => {
  vi.clearAllMocks();
  store = { pages: new Map(), cards: new Map() };
  vi.mocked(pages.get).mockImplementation(async (id) => store.pages.get(id));
  vi.mocked(pages.update).mockImplementation(async (id, changes) => {
    const e = store.pages.get(id);
    if (e) store.pages.set(id, { ...e, ...changes });
  });
  vi.mocked(pages.listByBook).mockImplementation(async (bookId) =>
    [...store.pages.values()].filter((p) => p.bookId === bookId),
  );
  vi.mocked(cards.get).mockImplementation(async (id) => store.cards.get(id));
  vi.mocked(cards.listByPage).mockImplementation(async (pageId) =>
    [...store.cards.values()].filter((c) => c.pageId === pageId),
  );
  vi.mocked(cards.create).mockImplementation(async (card) => {
    store.cards.set(card.id, card);
  });
  vi.mocked(cards.update).mockImplementation(async (id, changes) => {
    const e = store.cards.get(id);
    if (e) store.cards.set(id, { ...e, ...changes });
  });
  vi.mocked(cards.remove).mockImplementation(async (id) => {
    store.cards.delete(id);
  });
});

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'p1',
    bookId: 'b1',
    title: 'Bronze 1',
    tier: 'bronze',
    createdAt: 1_700_000_000_000,
    reviewableAt: 1_700_000_000_000 + 14 * MS_PER_DAY,
    cardIds: [],
    ...overrides,
  };
}
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
function seed(page: Page, cardList: Card[] = []): void {
  store.pages.set(page.id, { ...page, cardIds: cardList.map((c) => c.id) });
  for (const card of cardList) {
    store.cards.set(card.id, { ...card, pageId: page.id });
  }
}
function makeNCards(n: number): Card[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard({ id: `seed-${i}`, source: `src-${i}`, target: `tgt-${i}` }),
  );
}

function DashboardProbe() {
  return <span data-testid="route-dashboard-probe">dashboard</span>;
}
function renderListDetail(pageId: string) {
  return render(
    <MemoryRouter initialEntries={[`/list/${pageId}`]}>
      <Routes>
        <Route path="/list/:pageId" element={<ListDetail />} />
        <Route path="/" element={<DashboardProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}
async function addOneCard(
  user: ReturnType<typeof userEvent.setup>,
  src: string,
  tgt: string,
): Promise<void> {
  await user.type(screen.getByLabelText(/^source$/i), src);
  await user.type(screen.getByLabelText(/^target$/i), tgt);
  await user.click(screen.getByRole('button', { name: /^add$/i }));
}

// Discriminator helper: filter pages.update calls to only those affecting cardIds.
function cardIdsUpdateCalls(): readonly (readonly [string, Partial<Page>])[] {
  return vi
    .mocked(pages.update)
    .mock.calls.filter((c) =>
      Object.prototype.hasOwnProperty.call(c[1] ?? {}, 'cardIds'),
    ) as readonly (readonly [string, Partial<Page>])[];
}

// AC-7: page header + tier border (unreviewed Bronze)

describe('TASK-011 AC-7: ListDetail header + tier border', () => {
  it('AC-7: <h1> shows the Page title', async () => {
    seed(makePage({ title: 'Bronze 1' }));
    renderListDetail('p1');
    expect(
      await screen.findByRole('heading', { level: 1, name: /bronze 1/i }),
    ).toBeInTheDocument();
  });

  it('AC-7: TierBadge has aria-label === "Bronze" (kills hardcoded other tier)', async () => {
    seed(makePage({ tier: 'bronze' }));
    renderListDetail('p1');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Bronze');
  });

  it('AC-7: route container has the bronze borderClass substring', async () => {
    seed(makePage({ tier: 'bronze' }));
    renderListDetail('p1');
    await screen.findByRole('heading', { level: 1 });
    const root = screen.getByTestId('route-list-detail');
    const cls = tierVisual('bronze').borderClass;
    const hasBronze = [root, ...root.querySelectorAll('*')].some((el) =>
      (el.getAttribute('class') ?? '').includes(cls),
    );
    expect(hasBronze).toBe(true);
  });
});

// AC-8: Add-Card form present on unreviewed Page

describe('TASK-011 AC-8: ListDetail Add-Card form on unreviewed Page', () => {
  it('AC-8: form, both labelled empty inputs, and Add submit button are present', async () => {
    seed(makePage());
    renderListDetail('p1');
    expect(await screen.findByTestId('add-card-form')).toBeInTheDocument();
    const src = screen.getByLabelText(/^source$/i) as HTMLInputElement;
    const tgt = screen.getByLabelText(/^target$/i) as HTMLInputElement;
    expect(src.value).toBe('');
    expect(tgt.value).toBe('');
    const btn = screen.getByRole('button', { name: /^add$/i }) as HTMLButtonElement;
    expect(btn.type).toBe('submit');
  });
});

// AC-9: Add-Card validation

describe('TASK-011 AC-9: ListDetail Add-Card validation', () => {
  it('AC-9: empty both → no cards.create / no cardIds update; both errors visible', async () => {
    const user = userEvent.setup();
    seed(makePage());
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(cards.create).not.toHaveBeenCalled();
    expect(cardIdsUpdateCalls()).toHaveLength(0);
    expect(screen.getByTestId('error-add-source')).toBeInTheDocument();
    expect(screen.getByTestId('error-add-target')).toBeInTheDocument();
  });

  it('AC-9: only Source filled → submit blocked, only error-add-target shown', async () => {
    const user = userEvent.setup();
    seed(makePage());
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await user.type(screen.getByLabelText(/^source$/i), 'hola');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(cards.create).not.toHaveBeenCalled();
    expect(screen.queryByTestId('error-add-source')).not.toBeInTheDocument();
    expect(screen.getByTestId('error-add-target')).toBeInTheDocument();
  });

  it('AC-9: whitespace-only inputs are treated as empty', async () => {
    const user = userEvent.setup();
    seed(makePage());
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await user.type(screen.getByLabelText(/^source$/i), '   ');
    await user.type(screen.getByLabelText(/^target$/i), '   ');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(cards.create).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-add-source')).toBeInTheDocument();
    expect(screen.getByTestId('error-add-target')).toBeInTheDocument();
  });

  it("AC-9: typing into a field clears that field's error on next change", async () => {
    const user = userEvent.setup();
    seed(makePage());
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByTestId('error-add-source')).toBeInTheDocument();
    expect(screen.getByTestId('error-add-target')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^source$/i), 'h');
    expect(screen.queryByTestId('error-add-source')).not.toBeInTheDocument();
    // The other error is unaffected.
    expect(screen.getByTestId('error-add-target')).toBeInTheDocument();
  });
});

// AC-10: Add-Card success

describe('TASK-011 AC-10: ListDetail Add-Card success', () => {
  it('AC-10: cards.create called once with trimmed values + ULID id + correct shape', async () => {
    const user = userEvent.setup();
    seed(makePage({ id: 'p1', bookId: 'b1' }));
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await addOneCard(user, '  hello  ', '  hola  ');

    expect(cards.create).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(cards.create).mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg!.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(arg!.bookId).toBe('b1');
    expect(arg!.pageId).toBe('p1');
    expect(arg!.source).toBe('hello');
    expect(arg!.target).toBe('hola');
    expect(typeof arg!.createdAt).toBe('number');
    expect(arg!.createdAt).toBeGreaterThan(0);
    expect(arg!.archivedAt).toBeUndefined();
    expect(arg!.parentIds).toBeUndefined();
  });

  it('AC-10: pages.update called once with cardIds: [...prev, newId] (appended)', async () => {
    const user = userEvent.setup();
    seed(makePage({ id: 'p1' }), [makeCard({ id: 'old', source: 'one', target: 'uno' })]);
    renderListDetail('p1');
    await screen.findByTestId('card-row-old');
    await addOneCard(user, 'hello', 'hola');

    const calls = cardIdsUpdateCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('p1');
    const createArg = vi.mocked(cards.create).mock.calls[0]?.[0];
    expect(createArg).toBeDefined();
    // kills: [newId] (forgets prev), [newId, 'old'] (prepended), ['old'] (no append).
    expect(calls[0]![1].cardIds).toEqual(['old', createArg!.id]);
  });

  it('AC-10: after success — both inputs clear, no errors, source input has focus', async () => {
    const user = userEvent.setup();
    seed(makePage());
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await addOneCard(user, 'hello', 'hola');

    const src = await screen.findByLabelText(/^source$/i);
    const tgt = screen.getByLabelText(/^target$/i);
    expect((src as HTMLInputElement).value).toBe('');
    expect((tgt as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('error-add-source')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-add-target')).not.toBeInTheDocument();
    // kills: focus left on Add button or moved to Target (PRD §5.2.2).
    expect(document.activeElement).toBe(src);
  });

  it('AC-10: the new card appears in cards-list with both strings visible', async () => {
    const user = userEvent.setup();
    seed(makePage());
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await addOneCard(user, 'hello', 'hola');

    const createArg = vi.mocked(cards.create).mock.calls[0]?.[0];
    expect(createArg).toBeDefined();
    const row = await screen.findByTestId(`card-row-${createArg!.id}`);
    expect(within(row).getByText('hello')).toBeInTheDocument();
    expect(within(row).getByText('hola')).toBeInTheDocument();
  });
});

// AC-11: Card row Edit affordance

describe('TASK-011 AC-11: ListDetail Card row Edit affordance', () => {
  it('AC-11: each row has card-edit-<id>; click opens pre-populated inputs + Save/Cancel within the row', async () => {
    const user = userEvent.setup();
    seed(makePage(), [
      makeCard({ id: 'c1', source: 's1', target: 't1' }),
      makeCard({ id: 'c2', source: 's2', target: 't2' }),
    ]);
    renderListDetail('p1');
    await screen.findByTestId('card-row-c1');
    expect(screen.getByTestId('card-edit-c1')).toBeInTheDocument();
    expect(screen.getByTestId('card-edit-c2')).toBeInTheDocument();

    const row = screen.getByTestId('card-row-c1');
    await user.click(within(row).getByTestId('card-edit-c1'));
    const src = within(row).getByLabelText(/^source$/i) as HTMLInputElement;
    const tgt = within(row).getByLabelText(/^target$/i) as HTMLInputElement;
    expect(src.value).toBe('s1');
    expect(tgt.value).toBe('t1');
    expect(within(row).getByRole('button', { name: /^save$/i })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
  });

  it('AC-11: Save calls cards.update with trimmed values and exits edit-mode', async () => {
    const user = userEvent.setup();
    seed(makePage(), [makeCard({ id: 'c1', source: 's1', target: 't1' })]);
    renderListDetail('p1');
    const row = await screen.findByTestId('card-row-c1');
    await user.click(within(row).getByTestId('card-edit-c1'));

    const src = within(row).getByLabelText(/^source$/i);
    const tgt = within(row).getByLabelText(/^target$/i);
    await user.clear(src);
    await user.clear(tgt);
    await user.type(src, '  newSrc  ');
    await user.type(tgt, '  newTgt  ');
    await user.click(within(row).getByRole('button', { name: /^save$/i }));

    expect(cards.update).toHaveBeenCalledTimes(1);
    expect(cards.update).toHaveBeenCalledWith('c1', {
      source: 'newSrc',
      target: 'newTgt',
    });
    const refreshed = await screen.findByTestId('card-row-c1');
    expect(within(refreshed).queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(within(refreshed).getByText('newSrc')).toBeInTheDocument();
    expect(within(refreshed).getByText('newTgt')).toBeInTheDocument();
  });

  it('AC-11: Cancel exits edit-mode without calling cards.update; original values restored', async () => {
    const user = userEvent.setup();
    seed(makePage(), [makeCard({ id: 'c1', source: 's1', target: 't1' })]);
    renderListDetail('p1');
    const row = await screen.findByTestId('card-row-c1');
    await user.click(within(row).getByTestId('card-edit-c1'));
    const src = within(row).getByLabelText(/^source$/i);
    await user.clear(src);
    await user.type(src, 'edited-but-cancelled');
    await user.click(within(row).getByRole('button', { name: /^cancel$/i }));

    expect(cards.update).not.toHaveBeenCalled();
    const refreshed = await screen.findByTestId('card-row-c1');
    expect(within(refreshed).getByText('s1')).toBeInTheDocument();
    expect(within(refreshed).getByText('t1')).toBeInTheDocument();
  });
});

// AC-12: Card row Delete affordance

describe('TASK-011 AC-12: ListDetail Card row Delete affordance', () => {
  it('AC-12: click Delete calls cards.remove(id) + pages.update(pageId, {cardIds minus deleted}); row removed; no dialog', async () => {
    const user = userEvent.setup();
    seed(makePage(), [makeCard({ id: 'c1' }), makeCard({ id: 'c2', source: 's2' })]);
    renderListDetail('p1');
    await screen.findByTestId('card-row-c1');
    expect(screen.getByTestId('card-delete-c1')).toBeInTheDocument();
    expect(screen.getByTestId('card-delete-c2')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('card-delete-c1'));

    expect(cards.remove).toHaveBeenCalledTimes(1);
    expect(cards.remove).toHaveBeenCalledWith('c1');
    const calls = cardIdsUpdateCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('p1');
    expect(calls[0]![1].cardIds).toEqual(['c2']);

    await screen.findByTestId('card-row-c2');
    expect(screen.queryByTestId('card-row-c1')).not.toBeInTheDocument();
    // kills: a confirm modal appearing during/after the delete.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// AC-13: Edit/Delete HIDDEN on reviewed Page (locked branch)

describe('TASK-011 AC-13: ListDetail locked branch — reviewed Page', () => {
  function seedReviewed(): void {
    seed(makePage({ reviewedAt: 1_750_000_000_000 }), [
      makeCard({ id: 'c1' }),
      makeCard({ id: 'c2', source: 's2', target: 't2' }),
    ]);
  }

  it('AC-13: reviewedAt set → no add-card-form and no card-edit/delete buttons for any card', async () => {
    seedReviewed();
    renderListDetail('p1');
    await screen.findByTestId('card-row-c1');
    expect(screen.queryByTestId('add-card-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-edit-c1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-edit-c2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-delete-c1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-delete-c2')).not.toBeInTheDocument();
  });

  it('AC-13: list-locked element is rendered with matching copy; cards still visible', async () => {
    seed(makePage({ reviewedAt: 1_750_000_000_000 }), [
      makeCard({ id: 'c1', source: 'still-shown-src', target: 'still-shown-tgt' }),
    ]);
    renderListDetail('p1');
    const locked = await screen.findByTestId('list-locked');
    // kills: drop the copy or change "read-only" to "read only".
    expect(locked.textContent ?? '').toMatch(
      /this list has been reviewed and is read-only/i,
    );
    const row = screen.getByTestId('card-row-c1');
    expect(within(row).getByText('still-shown-src')).toBeInTheDocument();
    expect(within(row).getByText('still-shown-tgt')).toBeInTheDocument();
  });
});

// AC-14: Headlist warning appears at exactly 26 cards

const HEADLIST_WARNING_COPY =
  'You have 26 cards on this list. The Gold List Method recommends keeping a headlist around 25 entries — longer lists make distillation harder to remember.';

describe('TASK-011 AC-14: ListDetail headlist warning at 26 cards', () => {
  it('AC-14: 25 cards → no headlist-warning in the DOM', async () => {
    seed(makePage(), makeNCards(25));
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    expect(screen.queryByTestId('headlist-warning')).not.toBeInTheDocument();
  });

  it('AC-14: adding the 26th → warning appears with exact copy, role="status", BEFORE the form, and the card is still added', async () => {
    const user = userEvent.setup();
    seed(makePage(), makeNCards(25));
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await addOneCard(user, 'twenty-six-src', 'twenty-six-tgt');

    const warning = await screen.findByTestId('headlist-warning');
    // textContent includes the dismiss button's "×" — assert substring.
    expect(warning.textContent ?? '').toContain(HEADLIST_WARNING_COPY);
    expect(warning.getAttribute('role')).toBe('status');

    // Positioned BEFORE the form (compareDocumentPosition: bit 4 = FOLLOWING).
    const form = screen.getByTestId('add-card-form');
    const pos = warning.compareDocumentPosition(form);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0);
    expect(pos & Node.DOCUMENT_POSITION_PRECEDING).toBe(0);

    // The card was still added (warning doesn't gate the submit).
    expect(cards.create).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(cards.create).mock.calls[0]?.[0];
    expect(arg?.source).toBe('twenty-six-src');
    expect(arg?.target).toBe('twenty-six-tgt');
  });
});

// AC-15: Warning dismissal — dismiss sticks across further adds

describe('TASK-011 AC-15: ListDetail headlist warning dismissal', () => {
  it('AC-15: dismiss removes warning, and 27th/28th/29th adds do NOT re-render it', async () => {
    const user = userEvent.setup();
    seed(makePage(), makeNCards(25));
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');

    // Add 26th → warning visible.
    await addOneCard(user, 's26', 't26');
    await screen.findByTestId('headlist-warning');

    // Dismiss → warning gone.
    await user.click(screen.getByTestId('warning-dismiss'));
    expect(screen.queryByTestId('headlist-warning')).not.toBeInTheDocument();

    // Add 27th, 28th, 29th. None should bring the warning back.
    await addOneCard(user, 's27', 't27');
    await addOneCard(user, 's28', 't28');
    await addOneCard(user, 's29', 't29');
    expect(vi.mocked(cards.create).mock.calls.length).toBe(4);
    expect(screen.queryByTestId('headlist-warning')).not.toBeInTheDocument();
  });
});

// AC-16: Warning re-arms on remount + no localStorage/sessionStorage

describe('TASK-011 AC-16: ListDetail headlist warning re-arms on remount', () => {
  it('AC-16: dismissed warning re-appears after the route remounts', async () => {
    const user = userEvent.setup();
    seed(makePage(), makeNCards(26));
    const first = renderListDetail('p1');
    await screen.findByTestId('headlist-warning');
    await user.click(screen.getByTestId('warning-dismiss'));
    expect(screen.queryByTestId('headlist-warning')).not.toBeInTheDocument();

    // Unmount + mount fresh tree at the same path — observable equivalent
    // of React Router unmount/remount on path change away and back.
    first.unmount();
    const second = render(
      <MemoryRouter initialEntries={['/list/p1']}>
        <Routes>
          <Route path="/list/:pageId" element={<ListDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    // kills: persistence via localStorage / sessionStorage / Zustand (all would
    // survive the remount and the warning would stay dismissed).
    expect(await second.findByTestId('headlist-warning')).toBeInTheDocument();
  });

  it('AC-16: ListDetail/index.tsx source contains no `localStorage` substring', () => {
    expect(LISTDETAIL_SOURCE.length).toBeGreaterThan(0);
    expect(LISTDETAIL_SOURCE.includes('localStorage')).toBe(false);
  });

  it('AC-16: ListDetail/index.tsx source contains no `sessionStorage` substring', () => {
    expect(LISTDETAIL_SOURCE.length).toBeGreaterThan(0);
    expect(LISTDETAIL_SOURCE.includes('sessionStorage')).toBe(false);
  });
});

// AC-17: Warning behaviour after delete + re-add (same-mount vs remount)

describe('TASK-011 AC-17: ListDetail headlist warning — delete + re-add', () => {
  it('AC-17: same-mount: dismiss at 26 → delete one → add another → warning does NOT re-appear', async () => {
    const user = userEvent.setup();
    seed(makePage(), makeNCards(25));
    renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await addOneCard(user, 's26', 't26');
    await screen.findByTestId('headlist-warning');
    await user.click(screen.getByTestId('warning-dismiss'));

    await user.click(screen.getByTestId('card-delete-seed-0'));
    await screen.findByTestId('card-row-seed-1');
    expect(screen.queryByTestId('card-row-seed-0')).not.toBeInTheDocument();

    await addOneCard(user, 'sNew', 'tNew');
    expect(vi.mocked(cards.create).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId('headlist-warning')).not.toBeInTheDocument();
  });

  it('AC-17: remount between dismiss and re-add → warning DOES re-appear at 26', async () => {
    const user = userEvent.setup();
    seed(makePage(), makeNCards(25));
    const first = renderListDetail('p1');
    await screen.findByTestId('add-card-form');
    await addOneCard(user, 's26', 't26');
    await screen.findByTestId('headlist-warning');
    await user.click(screen.getByTestId('warning-dismiss'));
    expect(screen.queryByTestId('headlist-warning')).not.toBeInTheDocument();
    first.unmount();

    const second = render(
      <MemoryRouter initialEntries={['/list/p1']}>
        <Routes>
          <Route path="/list/:pageId" element={<ListDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await second.findByTestId('headlist-warning')).toBeInTheDocument();
  });
});
