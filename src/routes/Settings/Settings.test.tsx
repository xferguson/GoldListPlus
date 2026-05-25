import {
  describe, it, expect, beforeEach, afterEach, vi,
  type MockInstance,
} from 'vitest';
import {
  render, screen, within, fireEvent, waitFor, cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ulid } from 'ulid';
import { AppRoutes } from '../../App';
import { db } from '../../db/db';
import type { Book, BookSettings, Card, Page, ReviewEvent } from '../../db/db';
import * as books from '../../db/repos/books';
import * as pages from '../../db/repos/pages';
import * as cards from '../../db/repos/cards';
import * as reviews from '../../db/repos/reviews';
import { MS_PER_DAY } from '../../lib/time';

// --- Fixtures ---------------------------------------------------------------

const DEFAULT_SETTINGS: BookSettings = {
  distillationIntervalDays: 14, headlistSize: 25,
  autoDropOnEasy: true, autoDropOnModerate: true, autoDropOnHard: false,
};
const makeBook = (o: Partial<Book> = {}): Book => ({
  id: ulid(), name: 'Japanese', sourceLang: 'en', targetLang: 'ja',
  settings: { ...DEFAULT_SETTINGS }, createdAt: 1_700_000_000_000, ...o,
});
const makePage = (o: Partial<Page> = {}): Page => ({
  id: ulid(), bookId: ulid(), title: 'Bronze 1', tier: 'bronze',
  createdAt: 1_700_000_000_000,
  reviewableAt: 1_700_000_000_000 + 14 * MS_PER_DAY, cardIds: [], ...o,
});
const makeCard = (o: Partial<Card> = {}): Card => ({
  id: ulid(), bookId: ulid(), pageId: ulid(),
  source: 'hola', target: 'hello', createdAt: 1_700_000_000_000, ...o,
});
const makeReview = (o: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: ulid(), cardId: ulid(), pageId: ulid(),
  rating: 'easy', reviewedAt: 1_700_000_000_000, ...o,
});

const renderAtSettings = () => render(
  <MemoryRouter initialEntries={['/settings']}><AppRoutes /></MemoryRouter>,
);

// Seed: 2/3/8/12 — counts mirror AC-6 so status copy is anchored.
async function seed_2_3_8_12() {
  await books.create(makeBook({ id: 'B-A', name: 'Japanese' }));
  await books.create(makeBook({ id: 'B-B', name: 'French' }));
  await pages.create(makePage({ id: 'P1', bookId: 'B-A', tier: 'bronze', cardIds: [] }));
  await pages.create(makePage({ id: 'P2', bookId: 'B-A', tier: 'silver', cardIds: [] }));
  await pages.create(makePage({ id: 'P3', bookId: 'B-B', tier: 'gold', reviewableAt: null, cardIds: [] }));
  for (let i = 0; i < 8; i += 1) {
    await cards.create(makeCard({ id: `C${i + 1}`, bookId: 'B-A', pageId: 'P1' }));
  }
  for (let i = 0; i < 12; i += 1) {
    await reviews.append(makeReview({
      id: `R${i + 1}`, cardId: `C${(i % 8) + 1}`, pageId: 'P1',
    }));
  }
}

// Valid backup file content (2/3/8/12 counts).
const validBackup = (): string => JSON.stringify({
  version: 1, exportedAt: 1_700_000_000_000,
  books: [
    makeBook({ id: 'B-A', name: 'Japanese' }),
    makeBook({ id: 'B-B', name: 'French' }),
  ],
  pages: [
    makePage({ id: 'P1', bookId: 'B-A', tier: 'bronze', cardIds: [] }),
    makePage({ id: 'P2', bookId: 'B-A', tier: 'silver', cardIds: [] }),
    makePage({ id: 'P3', bookId: 'B-B', tier: 'gold', reviewableAt: null, cardIds: [] }),
  ],
  cards: Array.from({ length: 8 }, (_, i) =>
    makeCard({ id: `C${i + 1}`, bookId: 'B-A', pageId: 'P1' })),
  reviews: Array.from({ length: 12 }, (_, i) =>
    makeReview({ id: `R${i + 1}`, cardId: `C${(i % 8) + 1}`, pageId: 'P1' })),
});

// Inject a File into the import-file-input; returns the change event.
function pickFile(content: string, name = 'backup.json') {
  const file = new File([content], name, { type: 'application/json' });
  const input = screen.getByTestId('import-file-input') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

// --- Dexie + URL spy lifecycle ----------------------------------------------

beforeEach(async () => {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
});

afterEach(async () => {
  cleanup();
  if (db.isOpen()) db.close();
  vi.useRealTimers();
});

let createObjectURLSpy: MockInstance<(obj: Blob | MediaSource) => string>;
let revokeObjectURLSpy: MockInstance<(url: string) => void>;
const blobsCreated: Blob[] = [];

beforeEach(() => {
  blobsCreated.length = 0;
  // jsdom may not ship URL.createObjectURL — shim if missing.
  if (typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'stub';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    (URL as unknown as { revokeObjectURL: (s: string) => void }).revokeObjectURL = () => {};
  }
  createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((obj) => {
    blobsCreated.push(obj as Blob);
    return `blob:stub-${blobsCreated.length}`;
  });
  revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  createObjectURLSpy.mockRestore();
  revokeObjectURLSpy.mockRestore();
});

// --- AC-9: FK violation aborts before any write -----------------------------

describe('TASK-018 AC-9: FK violation aborts before any write (UI flow)', () => {
  // kills: implementer who runs validateForeignKeys INSIDE the import
  // transaction (post-confirm). The modal would leak; the DB might take
  // a write lock briefly. Locked spec: validate-before-confirm.
  it('TASK-018 AC-9: FK-missing file shows FK error, no confirm modal, no rows written', async () => {
    renderAtSettings();
    const ghostEnv = {
      version: 1, exportedAt: 1_700_000_000_000,
      books: [], pages: [makePage({ id: 'P-orphan', bookId: 'ghost' })],
      cards: [], reviews: [],
    };
    pickFile(JSON.stringify(ghostEnv));

    const errEl = await screen.findByTestId('sync-error');
    expect(errEl.textContent).toBe(
      "This backup is missing data it depends on (e.g. a list whose book isn't included). Nothing was imported.",
    );
    expect(errEl.getAttribute('role')).toBe('alert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await db.books.toArray()).toEqual([]);
    expect(await db.pages.toArray()).toEqual([]);
    expect(await db.cards.toArray()).toEqual([]);
    expect(await db.reviews.toArray()).toEqual([]);
  });
});

// --- AC-11: Export happy path -----------------------------------------------

describe('TASK-018 AC-11: Export happy path', () => {
  // kills: wrong Blob mime type; wrong filename (local-tz vs UTC); count from
  // DB instead of envelope; forgotten URL.revokeObjectURL; forgotten <a>.click.
  it('TASK-018 AC-11: clicking Export downloads a JSON Blob with locked envelope, deterministic filename, and status line', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 23, 7, 8, 9)));

    await seed_2_3_8_12();

    const downloads: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.getAttribute('download') ?? '');
      });

    try {
      renderAtSettings();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: /^export backup$/i }));

      await waitFor(() => {
        expect(screen.getByTestId('sync-status')).toBeInTheDocument();
      });

      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      const blob = blobsCreated[0];
      expect(blob).toBeDefined();
      expect(blob!.type).toBe('application/json');

      const env = JSON.parse(await blob!.text());
      expect(env.version).toBe(1);
      expect(env.exportedAt).toBe(Date.UTC(2026, 4, 23, 7, 8, 9));
      expect(env.books.length).toBe(2);
      expect(env.pages.length).toBe(3);
      expect(env.cards.length).toBe(8);
      expect(env.reviews.length).toBe(12);

      expect(downloads).toEqual(['goldlistplus-backup-20260523-070809.json']);
      expect(revokeObjectURLSpy).toHaveBeenCalled();

      const status = screen.getByTestId('sync-status');
      expect(status.textContent).toBe('Exported 2 books, 3 lists, 8 cards, 12 reviews.');
      expect(status.getAttribute('role')).toBe('status');

      const button = screen.getByRole('button', { name: /^export backup$/i });
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe('Export backup');
    } finally {
      clickSpy.mockRestore();
    }
  });

  // kills: implementer who never disables the button during export (double-
  // click race). Label must be exactly "Exporting…" with the … character.
  it('TASK-018 AC-11: while exporting, button is disabled and labelled "Exporting…"', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 23, 7, 8, 9)));

    await seed_2_3_8_12();

    let resolveExport: () => void = () => {};
    const exportGate = new Promise<void>((res) => { resolveExport = res; });
    const listSpy = vi.spyOn(books, 'list').mockImplementation(async () => {
      await exportGate; return [];
    });

    try {
      renderAtSettings();
      const button = screen.getByRole('button', { name: /^export backup$/i });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      void user.click(button);

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /exporting…/i });
        expect(btn).toBeDisabled();
        // kills: implementer using three dots "..." instead of "…".
        expect(btn.textContent).toContain('Exporting…');
      });

      resolveExport();
      await waitFor(() => {
        expect(screen.getByTestId('sync-status')).toBeInTheDocument();
      });
    } finally {
      listSpy.mockRestore();
    }
  });
});

// --- AC-12: Import happy path (validation → confirm → write → status) ------

describe('TASK-018 AC-12: Import happy path', () => {
  // kills: implementer who skips confirm modal (auto-import on pick); writes
  // BEFORE Import button click (premature persist).
  it('TASK-018 AC-12: valid file → no error → confirm modal with locked copy → Import writes and shows status', async () => {
    renderAtSettings();
    pickFile(validBackup());

    const dialog = await screen.findByRole('dialog', { name: /confirm import/i });
    expect(screen.queryByTestId('sync-error')).not.toBeInTheDocument();
    expect(dialog.textContent).toContain(
      'Import 2 books, 3 lists, 8 cards, 12 reviews? Existing entries with matching IDs will be overwritten. Other data on this device is kept.',
    );

    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /confirm import/i })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toBe(
        'Imported 2 books, 3 lists, 8 cards, 12 reviews (0 overwritten).',
      );
    });

    // Every row from the file is in the DB.
    expect((await books.list()).length).toBe(2);
    expect(await pages.get('P1')).toBeDefined();
    expect(await pages.get('P2')).toBeDefined();
    expect(await pages.get('P3')).toBeDefined();
    expect((await db.cards.toArray()).length).toBe(8);
    expect((await db.reviews.toArray()).length).toBe(12);
  });

  // kills: implementer who writes anyway on Cancel, or who binds Cancel to
  // the same handler as Import.
  it('TASK-018 AC-12: Cancel closes the modal and writes nothing', async () => {
    renderAtSettings();
    pickFile(validBackup());

    const dialog = await screen.findByRole('dialog', { name: /confirm import/i });
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /confirm import/i })).not.toBeInTheDocument();
    });

    expect(await db.books.toArray()).toEqual([]);
    expect(await db.pages.toArray()).toEqual([]);
    expect(await db.cards.toArray()).toEqual([]);
    expect(await db.reviews.toArray()).toEqual([]);
    expect(screen.queryByTestId('sync-status')).not.toBeInTheDocument();
  });
});

// --- AC-13: Parse / validation failures render locked PRD copy --------------

describe('TASK-018 AC-13: parse / validation failures render locked copy with no DB mutation', () => {
  // kills: swallowing JSON.parse throws / mapping all errors to generic copy.
  // The discriminated kind drives the PRD copy and matters per-case.
  it.each<[string, string, string]>([
    [
      'invalid JSON',
      '{ not valid json',
      "That file isn't valid JSON. Pick an exported backup file.",
    ],
    [
      'not-a-backup (well-formed JSON, wrong shape)',
      '{"hello":"world"}',
      "That file isn't a Gold List Plus backup.",
    ],
    [
      'newer-version (version 99)',
      '{"version":99,"exportedAt":1,"books":[],"pages":[],"cards":[],"reviews":[]}',
      'This backup was made by a newer version of Gold List Plus. Update the app and try again.',
    ],
    [
      'fk-missing (Page bookId is ghost)',
      JSON.stringify({
        version: 1, exportedAt: 1_700_000_000_000,
        books: [], pages: [{
          id: 'P-orphan', bookId: 'ghost', title: 'orphan', tier: 'bronze',
          createdAt: 1, reviewableAt: 1, cardIds: [],
        }], cards: [], reviews: [],
      }),
      "This backup is missing data it depends on (e.g. a list whose book isn't included). Nothing was imported.",
    ],
  ])(
    'TASK-018 AC-13: %s → locked copy, no modal, DB untouched',
    async (_label, content, expectedCopy) => {
      renderAtSettings();
      pickFile(content);

      const errEl = await screen.findByTestId('sync-error');
      expect(errEl.textContent).toBe(expectedCopy);
      expect(errEl.getAttribute('role')).toBe('alert');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await db.books.toArray()).toEqual([]);
      expect(await db.pages.toArray()).toEqual([]);
      expect(await db.cards.toArray()).toEqual([]);
      expect(await db.reviews.toArray()).toEqual([]);
    },
  );
});

// --- CHORE-004 AC-7: malformed-row UI surface ------------------------------

describe('CHORE-004 AC-7: malformed-row import surfaces locked copy, no modal, no DB writes', () => {
  // MUTATION: implementer hooks the new `malformed-row` kind into a generic
  // "Import failed." catch-all instead of the per-table user copy. The exact
  // textContent assertion below pins the PRD §5.10 wording.
  it('CHORE-004: malformed books[2] (missing name) → sync-error reads exact PRD copy, no confirm modal, DB untouched', async () => {
    renderAtSettings();

    // Two valid books then a third missing `name` — 1-based index = 3.
    const goodA = makeBook({ id: 'B-A', name: 'Japanese' });
    const goodB = makeBook({ id: 'B-B', name: 'French' });
    const badC: Record<string, unknown> = {
      id: 'B-C',
      // name: deliberately omitted
      sourceLang: 'en', targetLang: 'de',
      settings: { ...DEFAULT_SETTINGS }, createdAt: 1_700_000_000_000,
    };
    const malformedFile = JSON.stringify({
      version: 1, exportedAt: 1_700_000_000_000,
      books: [goodA, goodB, badC],
      pages: [], cards: [], reviews: [],
    });

    pickFile(malformedFile);

    const errEl = await screen.findByTestId('sync-error');
    expect(errEl.textContent).toBe(
      'This backup has a malformed book at row 3. Nothing was imported.',
    );
    expect(errEl.getAttribute('role')).toBe('alert');
    // No confirm modal — validation aborts before the user sees the dialog.
    expect(screen.queryByRole('dialog', { name: /confirm import/i })).not.toBeInTheDocument();
    // DB unchanged (mirror the FK-error pattern at line 150-153).
    expect(await db.books.toArray()).toEqual([]);
    expect(await db.pages.toArray()).toEqual([]);
    expect(await db.cards.toArray()).toEqual([]);
    expect(await db.reviews.toArray()).toEqual([]);
  });

  // MUTATION: implementer wires the table label into the wrong slot — e.g.
  // shows "malformed book" for every table. The matrix locks the per-table
  // copy so a single typo fails one row, not all four.
  it.each<[string, string, string]>([
    [
      'pages → "malformed list"',
      JSON.stringify({
        version: 1, exportedAt: 1_700_000_000_000,
        books: [], pages: [{
          id: 'P1', title: 'orphan', tier: 'bronze',
          createdAt: 1, reviewableAt: 1, cardIds: [],
          // bookId deliberately omitted
        }], cards: [], reviews: [],
      }),
      'This backup has a malformed list at row 1. Nothing was imported.',
    ],
    [
      'cards → "malformed card"',
      JSON.stringify({
        version: 1, exportedAt: 1_700_000_000_000,
        books: [], pages: [], cards: [{
          id: 'C1', bookId: 'B1',
          // pageId deliberately omitted
          source: 'hola', target: 'hello', createdAt: 1,
        }], reviews: [],
      }),
      'This backup has a malformed card at row 1. Nothing was imported.',
    ],
    [
      'reviews → "malformed review"',
      JSON.stringify({
        version: 1, exportedAt: 1_700_000_000_000,
        books: [], pages: [], cards: [], reviews: [{
          id: 'R1', pageId: 'P1', rating: 'easy', reviewedAt: 1,
          // cardId deliberately omitted
        }],
      }),
      'This backup has a malformed review at row 1. Nothing was imported.',
    ],
  ])('CHORE-004: %s renders exact PRD copy', async (_label, content, expectedCopy) => {
    renderAtSettings();
    pickFile(content);

    const errEl = await screen.findByTestId('sync-error');
    expect(errEl.textContent).toBe(expectedCopy);
    expect(screen.queryByRole('dialog', { name: /confirm import/i })).not.toBeInTheDocument();
    expect(await db.books.toArray()).toEqual([]);
    expect(await db.pages.toArray()).toEqual([]);
    expect(await db.cards.toArray()).toEqual([]);
    expect(await db.reviews.toArray()).toEqual([]);
  });

  // CHORE-004 review-kickback Finding B (observability MAJOR): the developer-
  // facing `reason` from the new `malformed-row` ImportError variant is dropped
  // on the floor — errorCopy only consumes {kind, table, index}. PRD §5.10
  // names reason as developer-facing, which here means console-visible.
  // MUTATION: dropping reason from the console.warn payload would let the test
  // pass with only {table, index}; expect.objectContaining({reason: expect.any(String)})
  // catches it.
  it('CHORE-004 Finding B: malformed-row → console.warn called with structured {table, index, reason} diagnostic', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderAtSettings();

      // Mirror the AC-7 books fixture: two valid books then a third missing
      // `name` — 1-based index = 3, table = 'books'.
      const goodA = makeBook({ id: 'B-A', name: 'Japanese' });
      const goodB = makeBook({ id: 'B-B', name: 'French' });
      const badC: Record<string, unknown> = {
        id: 'B-C',
        // name: deliberately omitted
        sourceLang: 'en', targetLang: 'de',
        settings: { ...DEFAULT_SETTINGS }, createdAt: 1_700_000_000_000,
      };
      const malformedFile = JSON.stringify({
        version: 1, exportedAt: 1_700_000_000_000,
        books: [goodA, goodB, badC],
        pages: [], cards: [], reviews: [],
      });

      pickFile(malformedFile);

      // Wait for the user-visible error to settle before asserting on the
      // console diagnostic — the warn happens in the same handler so once the
      // DOM has the error text, the warn must already have fired.
      const errEl = await screen.findByTestId('sync-error');
      expect(errEl.textContent).toBe(
        'This backup has a malformed book at row 3. Nothing was imported.',
      );

      // Flexible assertion shape — accepts either `console.warn(string, obj)`
      // or `console.warn(obj)` or any other arg arrangement. The contract is
      // that *somewhere* in the call args, an object with the structured
      // diagnostic appeared. This avoids pinning the log format.
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls.flat()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: 'books',
            index: 3,
            reason: expect.any(String),
          }),
        ]),
      );

      // Existing assertions from the suite still hold — confirm modal absent,
      // DB unchanged.
      expect(screen.queryByRole('dialog', { name: /confirm import/i }))
        .not.toBeInTheDocument();
      expect(await db.books.toArray()).toEqual([]);
      expect(await db.pages.toArray()).toEqual([]);
      expect(await db.cards.toArray()).toEqual([]);
      expect(await db.reviews.toArray()).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// --- DOM contracts (section heading, helper copy, buttons, hidden input) ---

describe('TASK-018: Settings route exposes the Backup & restore section', () => {
  it('TASK-018: h2 "Backup & restore" + PRD helper copy + Export/Import buttons + hidden JSON file input', () => {
    renderAtSettings();

    expect(screen.getByRole('heading', { level: 2, name: /backup & restore/i }))
      .toBeInTheDocument();

    expect(screen.getByText(
      'Your data never leaves your device unless you export it. Use Export to make a backup, and Import to restore one on this or another device.',
    )).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /^export backup$/i }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import backup$/i }))
      .toBeInTheDocument();

    const input = screen.getByTestId('import-file-input') as HTMLInputElement;
    expect(input.type).toBe('file');
    // kills: implementer who omits the accept attribute (the OS picker would
    // show every file type).
    expect(input.getAttribute('accept') ?? '').toMatch(/json/i);
  });
});
