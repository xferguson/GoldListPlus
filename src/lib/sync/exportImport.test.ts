import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ulid } from 'ulid';
import {
  buildExportEnvelope,
  formatExportFilename,
  parseExport,
  validateForeignKeys,
} from './exportImport';
import type { ExportEnvelope } from './exportImport';
import { db } from '../../db/db';
import type { Book, BookSettings, Card, Page, ReviewEvent } from '../../db/db';
import * as books from '../../db/repos/books';
import * as pages from '../../db/repos/pages';
import * as cards from '../../db/repos/cards';
import * as reviews from '../../db/repos/reviews';
// Per ADR-017 the import transaction lives in the Settings route layer, not
// in the pure lib. The import below pins the API shape: if the implementer
// chooses a different name the import fails at module load (Red).
import { runImportTransaction } from '../../routes/Settings/syncActions';

// Source-purity scan idiom — mirrors TASK-006 / TASK-009. Per ADR-017 the
// pure lib has no Dexie/React/Date.now/window refs.
const SYNC_SOURCE_MODULES = import.meta.glob('./exportImport.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const SYNC_SOURCE: string = SYNC_SOURCE_MODULES['./exportImport.ts'] ?? '';

// --- Fixtures ----------------------------------------------------------------
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
  reviewableAt: 1_700_000_000_000 + 14 * 86_400_000, cardIds: [], ...o,
});
const makeCard = (o: Partial<Card> = {}): Card => ({
  id: ulid(), bookId: ulid(), pageId: ulid(),
  source: 'hola', target: 'hello', createdAt: 1_700_000_000_000, ...o,
});
const makeReview = (o: Partial<ReviewEvent> = {}): ReviewEvent => ({
  id: ulid(), cardId: ulid(), pageId: ulid(),
  rating: 'easy', reviewedAt: 1_700_000_000_000, ...o,
});

// --- AC-1: buildExportEnvelope locked shape ---------------------------------

describe('TASK-018 AC-1: buildExportEnvelope', () => {
  // kills: version as string "1"; key reorder/rename; defensive
  // structuredClone of row arrays; Date/function leaking into the envelope.
  it('TASK-018 AC-1: returns locked shape — version=1 number, exportedAt passthrough, ref-equal arrays, JSON-clean', () => {
    const bookArr: Book[] = [makeBook({ id: 'B1' })];
    const pageArr: Page[] = [makePage({ id: 'P1', bookId: 'B1', reviewableAt: null, tier: 'gold' })];
    const cardArr: Card[] = [makeCard({ id: 'C1', bookId: 'B1', pageId: 'P1' })];
    const reviewArr: ReviewEvent[] = [makeReview({ id: 'R1', cardId: 'C1', pageId: 'P1', rating: 'wrong' })];
    const env = buildExportEnvelope({
      books: bookArr, pages: pageArr, cards: cardArr, reviews: reviewArr,
      exportedAt: 1_700_000_000_000,
    });
    expect(Object.is(env.version, 1)).toBe(true);
    expect(typeof env.version).toBe('number');
    expect(env.exportedAt).toBe(1_700_000_000_000);
    expect(Object.keys(env)).toEqual(['version', 'exportedAt', 'books', 'pages', 'cards', 'reviews']);
    expect(env.books).toBe(bookArr);
    expect(env.pages).toBe(pageArr);
    expect(env.cards).toBe(cardArr);
    expect(env.reviews).toBe(reviewArr);
    expect(JSON.parse(JSON.stringify(env))).toEqual(env);
  });
});

// --- AC-2: formatExportFilename deterministic UTC ---------------------------

describe('TASK-018 AC-2: formatExportFilename', () => {
  // kills: `getMonth`/`getDate`/`getHours` (local) instead of `getUTC*`;
  // dropped zero-padding; missing prefix/extension.
  it.each([
    [Date.UTC(2026, 4, 23, 7, 8, 9), 'goldlistplus-backup-20260523-070809.json'],
    [Date.UTC(2026, 0, 1, 0, 0, 0), 'goldlistplus-backup-20260101-000000.json'],
    [Date.UTC(2026, 11, 31, 23, 59, 59), 'goldlistplus-backup-20261231-235959.json'],
    [Date.UTC(1970, 0, 1, 0, 0, 0), 'goldlistplus-backup-19700101-000000.json'],
  ])('TASK-018 AC-2: %s → %s (UTC zero-padded)', (ts, expected) => {
    expect(formatExportFilename(ts)).toBe(expected);
  });
});

// --- AC-3: parseExport discriminated error union ----------------------------

describe('TASK-018 AC-3: parseExport — malformed inputs map to the locked kind', () => {
  // kills: collapsed/generic error; `Number(version)`/`== 1` coercion;
  // missing reviews check; non-array reviews accepted; null treated as object.
  it.each([
    ['null', null, 'not-a-backup'] as const,
    ['string', 'a string', 'not-a-backup'] as const,
    ['empty object (no version)', {}, 'not-a-backup'] as const,
    ['string version "1"', { version: '1', exportedAt: 1, books: [], pages: [], cards: [], reviews: [] }, 'not-a-backup'] as const,
    ['string exportedAt', { version: 1, exportedAt: 'now', books: [], pages: [], cards: [], reviews: [] }, 'not-a-backup'] as const,
    ['missing reviews', { version: 1, exportedAt: 1, books: [], pages: [], cards: [] }, 'not-a-backup'] as const,
    ['non-array reviews', { version: 1, exportedAt: 1, books: [], pages: [], cards: [], reviews: 'oops' }, 'not-a-backup'] as const,
  ])('TASK-018 AC-3: %s → kind=%s', (_label, input, expectedKind) => {
    const result = parseExport(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe(expectedKind);
  });

  // kills: implementer who treats `version === 0` as still valid OR who drops
  // the numeric version off the error payload (UI copy would say "newer version
  // undefined").
  it.each([2, 0, 99])(
    'TASK-018 AC-3: version=%s → kind=newer-version with version carried through',
    (badVersion) => {
      const result = parseExport({
        version: badVersion, exportedAt: 1,
        books: [], pages: [], cards: [], reviews: [],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('newer-version');
        if (result.error.kind === 'newer-version') {
          expect(result.error.version).toBe(badVersion);
        }
      }
    },
  );

  // kills: `{ ok: false }` for every input — the positive case anchors purpose.
  it('TASK-018 AC-3: valid minimal envelope → ok:true with envelope passed through', () => {
    const input = {
      version: 1 as const, exportedAt: 1_700_000_000_000,
      books: [], pages: [], cards: [], reviews: [],
    };
    const result = parseExport(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.version).toBe(1);
      expect(result.envelope.exportedAt).toBe(1_700_000_000_000);
      expect(result.envelope.books).toEqual([]);
      expect(result.envelope.pages).toEqual([]);
      expect(result.envelope.cards).toEqual([]);
      expect(result.envelope.reviews).toEqual([]);
    }
  });

  // kills: parseExport that throws on weird inputs (Symbol/Date). The caller
  // synthesises invalid-json from JSON.parse throws; parser itself only returns.
  it('TASK-018 AC-3: never throws for any input', () => {
    expect(() => parseExport(42)).not.toThrow();
    expect(() => parseExport([])).not.toThrow();
    expect(() => parseExport(undefined)).not.toThrow();
    expect(() => parseExport(true)).not.toThrow();
  });
});

// --- AC-4: validateForeignKeys ----------------------------------------------

describe('TASK-018 AC-4: validateForeignKeys', () => {
  const emptyDbIds = () => ({
    bookIds: new Set<string>(), pageIds: new Set<string>(), cardIds: new Set<string>(),
  });
  const envOf = (parts: Partial<ExportEnvelope>): ExportEnvelope => ({
    version: 1, exportedAt: 1_700_000_000_000,
    books: parts.books ?? [], pages: parts.pages ?? [],
    cards: parts.cards ?? [], reviews: parts.reviews ?? [],
  });

  // kills: id sets built from only DB rows; skipped Page.bookId loop; skipped
  // Card.pageId check; skipped ReviewEvent loop entirely.
  it.each<[string, ExportEnvelope, ReturnType<typeof emptyDbIds>, boolean]>([
    [
      'self-contained Book→Page',
      envOf({ books: [makeBook({ id: 'b1' })], pages: [makePage({ id: 'p1', bookId: 'b1' })] }),
      emptyDbIds(), true,
    ],
    [
      'Page bookId resolves via DB (partial backup)',
      envOf({ pages: [makePage({ id: 'p1', bookId: 'b1' })] }),
      { bookIds: new Set(['b1']), pageIds: new Set(), cardIds: new Set() }, true,
    ],
    [
      'fully self-contained Book→Page→Card→ReviewEvent',
      envOf({
        books: [makeBook({ id: 'b1' })],
        pages: [makePage({ id: 'p1', bookId: 'b1' })],
        cards: [makeCard({ id: 'c1', bookId: 'b1', pageId: 'p1' })],
        reviews: [makeReview({ id: 'r1', cardId: 'c1', pageId: 'p1' })],
      }),
      emptyDbIds(), true,
    ],
    [
      'Page bookId missing → fk-missing',
      envOf({ pages: [makePage({ id: 'p1', bookId: 'missing' })] }),
      emptyDbIds(), false,
    ],
    [
      'Card pageId missing → fk-missing',
      envOf({
        books: [makeBook({ id: 'b1' })],
        cards: [makeCard({ id: 'c1', bookId: 'b1', pageId: 'p-missing' })],
      }),
      emptyDbIds(), false,
    ],
    [
      'ReviewEvent cardId missing → fk-missing',
      envOf({
        books: [makeBook({ id: 'b1' })],
        pages: [makePage({ id: 'p1', bookId: 'b1' })],
        reviews: [makeReview({ id: 'r1', cardId: 'c-missing', pageId: 'p1' })],
      }),
      emptyDbIds(), false,
    ],
  ])('TASK-018 AC-4: %s → ok=%s', (_label, env, dbIds, expectedOk) => {
    const result = validateForeignKeys(env, dbIds);
    expect(result.ok).toBe(expectedOk);
    if (!result.ok) expect(result.error.kind).toBe('fk-missing');
  });

  // kills: implementer who eagerly validates Card.parentIds (ADR-017
  // explicitly excludes parentIds / parentPageId / childPageId from v1).
  it('TASK-018 AC-4: Card.parentIds:["ghost"] is NOT validated → ok:true', () => {
    const env = envOf({
      books: [makeBook({ id: 'b1' })],
      pages: [makePage({ id: 'p1', bookId: 'b1' })],
      cards: [makeCard({ id: 'c1', bookId: 'b1', pageId: 'p1', parentIds: ['ghost'] })],
    });
    expect(validateForeignKeys(env, emptyDbIds()).ok).toBe(true);
  });
});

// --- Dexie-backed tests (AC-5/6/7/8/10) -------------------------------------

beforeEach(async () => {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
});
afterEach(async () => { if (db.isOpen()) db.close(); });

// --- AC-5: Round-trip integrity through Dexie -------------------------------

describe('TASK-018 AC-5: round-trip integrity through Dexie', () => {
  // kills: skipping a table in the import loop; coercing `reviewableAt: null`
  // → 0 (Gold sacred rule #3 broken); dropping optional fields (archivedAt /
  // parentPageId / childPageId / parentIds) silently from the envelope.
  it('TASK-018 AC-5: every row round-trips deep-equal — Gold reviewableAt:null, archivedAt, parent/child links', async () => {
    const bookA = makeBook({ id: 'B-A' });
    const bookB = makeBook({
      id: 'B-B',
      settings: {
        distillationIntervalDays: 21, headlistSize: 30,
        autoDropOnEasy: false, autoDropOnModerate: false, autoDropOnHard: true,
      },
    });
    const bronze = makePage({ id: 'P-BRZ', bookId: 'B-A', tier: 'bronze', cardIds: ['C1', 'C2', 'C3'] });
    const silver = makePage({
      id: 'P-SLV', bookId: 'B-A', tier: 'silver',
      cardIds: ['C4', 'C5', 'C6'], childPageId: 'P-GLD',
    });
    const gold = makePage({
      id: 'P-GLD', bookId: 'B-A', tier: 'gold', reviewableAt: null,
      cardIds: ['C7', 'C8'], parentPageId: 'P-SLV',
    });
    const cardArr: Card[] = [
      makeCard({ id: 'C1', bookId: 'B-A', pageId: 'P-BRZ' }),
      makeCard({ id: 'C2', bookId: 'B-A', pageId: 'P-BRZ' }),
      makeCard({ id: 'C3', bookId: 'B-A', pageId: 'P-BRZ', archivedAt: 1_750_000_000_000 }),
      makeCard({ id: 'C4', bookId: 'B-A', pageId: 'P-SLV', parentIds: ['C1', 'C2'] }),
      makeCard({ id: 'C5', bookId: 'B-A', pageId: 'P-SLV' }),
      makeCard({ id: 'C6', bookId: 'B-A', pageId: 'P-SLV' }),
      makeCard({ id: 'C7', bookId: 'B-A', pageId: 'P-GLD', parentIds: ['C4'] }),
      makeCard({ id: 'C8', bookId: 'B-A', pageId: 'P-GLD' }),
    ];
    const pageOf = (cId: string): string =>
      cId === 'C7' || cId === 'C8' ? 'P-GLD'
        : cId === 'C1' || cId === 'C2' || cId === 'C3' ? 'P-BRZ' : 'P-SLV';
    const reviewArr: ReviewEvent[] = Array.from({ length: 12 }, (_, i) => {
      const cardId = `C${(i % 8) + 1}`;
      return makeReview({ id: `R${i + 1}`, cardId, pageId: pageOf(cardId) });
    });

    await books.create(bookA);
    await books.create(bookB);
    await pages.create(bronze);
    await pages.create(silver);
    await pages.create(gold);
    for (const c of cardArr) await cards.create(c);
    for (const r of reviewArr) await reviews.append(r);

    const env = buildExportEnvelope({
      books: await books.list(),
      pages: [
        ...(await pages.listByBook('B-A')),
        ...(await pages.listByBook('B-B')),
      ],
      cards: [
        ...(await cards.listByPage('P-BRZ')),
        ...(await cards.listByPage('P-SLV')),
        ...(await cards.listByPage('P-GLD')),
      ],
      reviews: [
        ...(await reviews.listByPage('P-BRZ')),
        ...(await reviews.listByPage('P-SLV')),
        ...(await reviews.listByPage('P-GLD')),
      ],
      exportedAt: 1_700_000_000_000,
    });
    const jsonText = JSON.stringify(env);

    if (db.isOpen()) db.close();
    await db.delete();
    await db.open();

    const parsed = parseExport(JSON.parse(jsonText));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('parse failed');
    expect(validateForeignKeys(parsed.envelope, {
      bookIds: new Set(), pageIds: new Set(), cardIds: new Set(),
    }).ok).toBe(true);
    await runImportTransaction(parsed.envelope);

    expect((await books.list()).length).toBe(2);
    expect((await db.pages.toArray()).length).toBe(3);
    expect((await db.cards.toArray()).length).toBe(8);
    expect((await db.reviews.toArray()).length).toBe(12);

    const goldAfter = await pages.get('P-GLD');
    expect(goldAfter?.reviewableAt).toBeNull(); // not 0, not undefined
    expect(goldAfter?.tier).toBe('gold');
    expect(goldAfter?.parentPageId).toBe('P-SLV');
    expect((await pages.get('P-SLV'))?.childPageId).toBe('P-GLD');
    expect((await cards.get('C3'))?.archivedAt).toBe(1_750_000_000_000);
    expect((await cards.get('C4'))?.parentIds).toEqual(['C1', 'C2']);
    expect((await cards.get('C7'))?.parentIds).toEqual(['C4']);

    expect(await books.get('B-A')).toEqual(bookA);
    expect(await books.get('B-B')).toEqual(bookB);
    expect(await pages.get('P-BRZ')).toEqual(bronze);
    expect(await pages.get('P-SLV')).toEqual(silver);
    expect(await pages.get('P-GLD')).toEqual(gold);
    for (const c of cardArr) expect(await cards.get(c.id)).toEqual(c);
    const sortedAfter = (await db.reviews.toArray()).sort((a, b) => a.id.localeCompare(b.id));
    const sortedBefore = [...reviewArr].sort((a, b) => a.id.localeCompare(b.id));
    expect(sortedAfter).toEqual(sortedBefore);
  });
});

// --- AC-6: Idempotency ------------------------------------------------------

describe('TASK-018 AC-6: importing the same envelope twice is a no-op semantically', () => {
  // kills: `add` instead of `put` ("Key already exists" throw on second import);
  // wrong overwritten count (0 instead of 25).
  it('TASK-018 AC-6: second import deep-equals first; overwritten count flips 0 → 25', async () => {
    const env: ExportEnvelope = {
      version: 1, exportedAt: 1_700_000_000_000,
      books: [makeBook({ id: 'B1' }), makeBook({ id: 'B2' })],
      pages: [
        makePage({ id: 'P1', bookId: 'B1', cardIds: [] }),
        makePage({ id: 'P2', bookId: 'B1', cardIds: [] }),
        makePage({ id: 'P3', bookId: 'B2', cardIds: [] }),
      ],
      cards: Array.from({ length: 8 }, (_, i) =>
        makeCard({ id: `C${i + 1}`, bookId: 'B1', pageId: 'P1' })),
      reviews: Array.from({ length: 12 }, (_, i) =>
        makeReview({ id: `R${i + 1}`, cardId: `C${(i % 8) + 1}`, pageId: 'P1' })),
    };

    const first = await runImportTransaction(env);
    expect(first.overwritten).toBe(0);

    const afterFirst = {
      books: await books.list(),
      pages: await db.pages.toArray(),
      cards: await db.cards.toArray(),
      reviews: await db.reviews.toArray(),
    };

    const second = await runImportTransaction(env);
    expect(second.overwritten).toBe(25);

    expect(await books.list()).toEqual(afterFirst.books);
    expect(await db.pages.toArray()).toEqual(afterFirst.pages);
    expect(await db.cards.toArray()).toEqual(afterFirst.cards);
    expect(await db.reviews.toArray()).toEqual(afterFirst.reviews);
  });
});

// --- AC-7: Collision policy — file row wins, no field merge ----------------

describe('TASK-018 AC-7: collision policy', () => {
  // kills: `{ ...db, ...file }` field merge (createdAt: 1000 would survive);
  // shallow merge that does not recurse into nested `settings` block.
  it('TASK-018 AC-7: file Book replaces DB Book entirely — including nested settings sub-object', async () => {
    const dbBook: Book = {
      id: 'b1', name: 'Original', sourceLang: 'en', targetLang: 'ja',
      settings: {
        distillationIntervalDays: 14, headlistSize: 25,
        autoDropOnHard: false, autoDropOnModerate: true, autoDropOnEasy: true,
      },
      createdAt: 1000,
    };
    await books.create(dbBook);

    const fileBook: Book = {
      id: 'b1', name: 'Replaced', sourceLang: 'fr', targetLang: 'de',
      settings: {
        distillationIntervalDays: 7, headlistSize: 20,
        autoDropOnHard: true, autoDropOnModerate: false, autoDropOnEasy: false,
      },
      createdAt: 2000,
    };
    await runImportTransaction({
      version: 1, exportedAt: 1_700_000_000_000,
      books: [fileBook], pages: [], cards: [], reviews: [],
    });

    const after = await books.get('b1');
    expect(after).toEqual(fileBook);
    expect(after?.createdAt).toBe(2000);
    expect(after?.settings.distillationIntervalDays).toBe(7);
    expect(after?.settings.autoDropOnHard).toBe(true);
    expect(after?.settings.autoDropOnEasy).toBe(false);
  });
});

// --- AC-8: Unrelated rows survive import ------------------------------------

describe('TASK-018 AC-8: unrelated rows survive import', () => {
  // kills: implementer who `table.clear()` (or `db.delete()`) before writing
  // file rows — the "keep" rows would be erased.
  it('TASK-018 AC-8: keep rows survive when file contains only overwrite rows', async () => {
    const bookKeep = makeBook({ id: 'B-keep', name: 'Survives' });
    const bookOverwrite = makeBook({ id: 'B-overwrite', name: 'Pre' });
    const pageKeep = makePage({ id: 'P-keep', bookId: 'B-keep', cardIds: [] });
    const pageOverwrite = makePage({ id: 'P-overwrite', bookId: 'B-overwrite', title: 'Pre', cardIds: [] });
    const cardKeep = makeCard({ id: 'CARD-keep', bookId: 'B-keep', pageId: 'P-keep' });
    const cardOverwrite = makeCard({ id: 'CARD-overwrite', bookId: 'B-overwrite', pageId: 'P-overwrite', source: 'pre' });

    await books.create(bookKeep);
    await books.create(bookOverwrite);
    await pages.create(pageKeep);
    await pages.create(pageOverwrite);
    await cards.create(cardKeep);
    await cards.create(cardOverwrite);

    const fileBookOverwrite: Book = { ...bookOverwrite, name: 'Post' };
    const filePageOverwrite: Page = { ...pageOverwrite, title: 'Post' };
    const fileCardOverwrite: Card = { ...cardOverwrite, source: 'post' };

    await runImportTransaction({
      version: 1, exportedAt: 1_700_000_000_000,
      books: [fileBookOverwrite], pages: [filePageOverwrite],
      cards: [fileCardOverwrite], reviews: [],
    });

    expect(await books.get('B-overwrite')).toEqual(fileBookOverwrite);
    expect(await pages.get('P-overwrite')).toEqual(filePageOverwrite);
    expect(await cards.get('CARD-overwrite')).toEqual(fileCardOverwrite);

    expect(await books.get('B-keep')).toEqual(bookKeep);
    expect(await pages.get('P-keep')).toEqual(pageKeep);
    expect(await cards.get('CARD-keep')).toEqual(cardKeep);
  });
});

// --- AC-10: Transaction rollback on mid-write error -------------------------

describe('TASK-018 AC-10: import transaction rolls back atomically on mid-write error', () => {
  // kills: four separate per-table transactions instead of one — the earlier
  // tables would be committed before the cards.put threw.
  it('TASK-018 AC-10: third cards.put throws → all four tables remain empty', async () => {
    const env: ExportEnvelope = {
      version: 1, exportedAt: 1_700_000_000_000,
      books: [makeBook({ id: 'B1' }), makeBook({ id: 'B2' })],
      pages: [
        makePage({ id: 'P1', bookId: 'B1', cardIds: [] }),
        makePage({ id: 'P2', bookId: 'B1', cardIds: [] }),
      ],
      cards: [
        makeCard({ id: 'C1', bookId: 'B1', pageId: 'P1' }),
        makeCard({ id: 'C2', bookId: 'B1', pageId: 'P1' }),
        makeCard({ id: 'C3', bookId: 'B1', pageId: 'P1' }),
        makeCard({ id: 'C4', bookId: 'B1', pageId: 'P1' }),
        makeCard({ id: 'C5', bookId: 'B1', pageId: 'P1' }),
      ],
      reviews: [makeReview({ id: 'R1', cardId: 'C1', pageId: 'P1' })],
    };

    let callCount = 0;
    const originalPut = db.cards.put.bind(db.cards);
    const spy = vi.spyOn(db.cards, 'put').mockImplementation(
      (row: Card, key?: string) => {
        callCount += 1;
        if (callCount === 3) throw new Error('forced failure on third cards.put');
        return originalPut(row, key as never);
      },
    );

    try {
      await expect(runImportTransaction(env)).rejects.toBeDefined();
    } finally {
      spy.mockRestore();
    }

    expect(await db.books.toArray()).toEqual([]);
    expect(await db.pages.toArray()).toEqual([]);
    expect(await db.cards.toArray()).toEqual([]);
    expect(await db.reviews.toArray()).toEqual([]);
  });
});

// --- Source-purity scan: exportImport.ts is pure per ADR-017 ---------------

describe('TASK-018: exportImport.ts is pure (no Dexie / React / Date.now / window)', () => {
  // kills: misconfigured ?raw glob silently returning '' — purity checks pass vacuously.
  it('TASK-018: source was loaded', () => {
    expect(SYNC_SOURCE.length).toBeGreaterThan(0);
  });

  const FORBIDDEN: readonly string[] = [
    'dexie', 'react', 'react-dom', 'react-router-dom', 'zustand',
    '../../db/repos/books', '../../db/repos/pages',
    '../../db/repos/cards', '../../db/repos/reviews',
  ];

  it.each(FORBIDDEN)('TASK-018: no runtime `from "%s"` import', (mod) => {
    const a = `from '${mod}'`;
    const b = `from "${mod}"`;
    expect(
      SYNC_SOURCE.includes(a) || SYNC_SOURCE.includes(b),
      `exportImport.ts unexpectedly imports from ${mod}`,
    ).toBe(false);
  });

  // kills: a value-shaped import from '../../db/db' would pull in the Dexie
  // runtime singleton and break ADR-017. Type-only imports are fine.
  it('TASK-018: any import from ../../db/db is type-only', () => {
    const lines = SYNC_SOURCE.split('\n').filter((l) =>
      /from\s+['"]\.\.\/\.\.\/db\/db['"]/.test(l));
    for (const line of lines) {
      const typeOnly = /import\s+type\s+/.test(line);
      const inlineType = /import\s+\{\s*type\s+/.test(line);
      expect(typeOnly || inlineType, `Non-type-only: ${line}`).toBe(true);
    }
  });

  // kills: §3 rule 6 violation — pure lib never calls Date.now().
  it('TASK-018: no `Date.now(` call', () => {
    expect(SYNC_SOURCE.includes('Date.now(')).toBe(false);
  });

  // kills: any `window.` reference — pure lib stays browser-agnostic.
  it('TASK-018: no `window.` reference', () => {
    expect(SYNC_SOURCE.includes('window.')).toBe(false);
  });
});
