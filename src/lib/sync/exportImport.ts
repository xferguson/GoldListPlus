import type { Book, Card, Page, ReviewEvent } from '../../db/db';

export type ExportEnvelope = {
  version: 1;
  exportedAt: number;
  books: Book[];
  pages: Page[];
  cards: Card[];
  reviews: ReviewEvent[];
};

export type MalformedRowTable = 'books' | 'pages' | 'cards' | 'reviews';

export type ImportError =
  | { kind: 'invalid-json' }
  | { kind: 'not-a-backup' }
  | { kind: 'newer-version'; version: number }
  | { kind: 'malformed-row'; table: MalformedRowTable; index: number; reason: string };

export type ParseResult =
  | { ok: true; envelope: ExportEnvelope }
  | { ok: false; error: ImportError };

export type ForeignKeyResult =
  | { ok: true }
  | { ok: false; error: { kind: 'fk-missing' } };

export function buildExportEnvelope(input: {
  books: Book[];
  pages: Page[];
  cards: Card[];
  reviews: ReviewEvent[];
  exportedAt: number;
}): ExportEnvelope {
  return {
    version: 1,
    exportedAt: input.exportedAt,
    books: input.books,
    pages: input.pages,
    cards: input.cards,
    reviews: input.reviews,
  };
}

export function formatExportFilename(exportedAt: number): string {
  const d = new Date(exportedAt);
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const yyyy = pad(d.getUTCFullYear(), 4);
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `goldlistplus-backup-${yyyy}${mm}${dd}-${hh}${min}${ss}.json`;
}

type RowValidation<T> =
  | { ok: true; row: T }
  | { ok: false; reason: string };

const ID_BAD_CHARS = /[#?/]/;
const TIERS: ReadonlySet<string> = new Set(['bronze', 'silver', 'gold']);
const RATINGS: ReadonlySet<string> = new Set(['wrong', 'hard', 'moderate', 'easy']);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidId(value: unknown): value is string {
  return isNonEmptyString(value) && !ID_BAD_CHARS.test(value);
}

function validateBookRow(input: unknown): RowValidation<Book> {
  if (!isObject(input)) return { ok: false, reason: 'row is not an object' };
  if (!isValidId(input.id)) return { ok: false, reason: "missing or malformed 'id'" };
  if (typeof input.name !== 'string') return { ok: false, reason: "missing or non-string 'name'" };
  if (typeof input.sourceLang !== 'string') return { ok: false, reason: "missing or non-string 'sourceLang'" };
  if (typeof input.targetLang !== 'string') return { ok: false, reason: "missing or non-string 'targetLang'" };
  if (!Number.isFinite(input.createdAt)) return { ok: false, reason: "'createdAt' is not a finite number" };
  if (!isObject(input.settings)) return { ok: false, reason: "missing or malformed 'settings'" };
  const s = input.settings;
  if (!Number.isFinite(s.distillationIntervalDays)) {
    return { ok: false, reason: "'settings.distillationIntervalDays' is not a finite number" };
  }
  if (!Number.isFinite(s.headlistSize)) {
    return { ok: false, reason: "'settings.headlistSize' is not a finite number" };
  }
  if (typeof s.autoDropOnEasy !== 'boolean') return { ok: false, reason: "'settings.autoDropOnEasy' is not a boolean" };
  if (typeof s.autoDropOnModerate !== 'boolean') return { ok: false, reason: "'settings.autoDropOnModerate' is not a boolean" };
  if (typeof s.autoDropOnHard !== 'boolean') return { ok: false, reason: "'settings.autoDropOnHard' is not a boolean" };
  const row: Book = {
    id: input.id,
    name: input.name,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    settings: {
      distillationIntervalDays: s.distillationIntervalDays as number,
      headlistSize: s.headlistSize as number,
      autoDropOnEasy: s.autoDropOnEasy,
      autoDropOnModerate: s.autoDropOnModerate,
      autoDropOnHard: s.autoDropOnHard,
    },
    createdAt: input.createdAt as number,
  };
  return { ok: true, row };
}

function validatePageRow(input: unknown): RowValidation<Page> {
  if (!isObject(input)) return { ok: false, reason: 'row is not an object' };
  if (!isValidId(input.id)) return { ok: false, reason: "missing or malformed 'id'" };
  if (typeof input.bookId !== 'string' || input.bookId.length === 0) {
    return { ok: false, reason: "missing or non-string 'bookId'" };
  }
  if (typeof input.title !== 'string') return { ok: false, reason: "missing or non-string 'title'" };
  if (typeof input.tier !== 'string' || !TIERS.has(input.tier)) {
    return { ok: false, reason: "'tier' is not a valid enum value" };
  }
  if (!Number.isFinite(input.createdAt)) return { ok: false, reason: "'createdAt' is not a finite number" };
  if (input.reviewableAt !== null && !Number.isFinite(input.reviewableAt)) {
    return { ok: false, reason: "'reviewableAt' is not null or a finite number" };
  }
  if (!Array.isArray(input.cardIds) || !input.cardIds.every((x) => isNonEmptyString(x))) {
    return { ok: false, reason: 'cardIds is not an array of non-empty strings' };
  }
  if (input.reviewedAt !== undefined && !Number.isFinite(input.reviewedAt)) {
    return { ok: false, reason: "'reviewedAt' is present but not a finite number" };
  }
  if (input.parentPageId !== undefined && typeof input.parentPageId !== 'string') {
    return { ok: false, reason: "'parentPageId' is present but not a string" };
  }
  if (input.childPageId !== undefined && typeof input.childPageId !== 'string') {
    return { ok: false, reason: "'childPageId' is present but not a string" };
  }
  if (input.lastNotifiedAt !== undefined && !Number.isFinite(input.lastNotifiedAt)) {
    return { ok: false, reason: "'lastNotifiedAt' is present but not a finite number" };
  }
  const row: Page = {
    id: input.id,
    bookId: input.bookId,
    title: input.title,
    tier: input.tier as Page['tier'],
    createdAt: input.createdAt as number,
    reviewableAt: input.reviewableAt as number | null,
    cardIds: input.cardIds as string[],
  };
  if (input.reviewedAt !== undefined) row.reviewedAt = input.reviewedAt as number;
  if (input.parentPageId !== undefined) row.parentPageId = input.parentPageId;
  if (input.childPageId !== undefined) row.childPageId = input.childPageId;
  if (input.lastNotifiedAt !== undefined) row.lastNotifiedAt = input.lastNotifiedAt as number;
  return { ok: true, row };
}

function validateCardRow(input: unknown): RowValidation<Card> {
  if (!isObject(input)) return { ok: false, reason: 'row is not an object' };
  if (!isValidId(input.id)) return { ok: false, reason: "missing or malformed 'id'" };
  if (typeof input.bookId !== 'string' || input.bookId.length === 0) {
    return { ok: false, reason: "missing or non-string 'bookId'" };
  }
  if (typeof input.pageId !== 'string' || input.pageId.length === 0) {
    return { ok: false, reason: "missing or non-string 'pageId'" };
  }
  if (typeof input.source !== 'string') return { ok: false, reason: "missing or non-string 'source'" };
  if (typeof input.target !== 'string') return { ok: false, reason: "missing or non-string 'target'" };
  if (!Number.isFinite(input.createdAt)) return { ok: false, reason: "'createdAt' is not a finite number" };
  if (
    input.parentIds !== undefined &&
    (!Array.isArray(input.parentIds) || !input.parentIds.every((x) => isNonEmptyString(x)))
  ) {
    return { ok: false, reason: 'parentIds is present but is not an array of non-empty strings' };
  }
  if (input.archivedAt !== undefined && !Number.isFinite(input.archivedAt)) {
    return { ok: false, reason: "'archivedAt' is present but not a finite number" };
  }
  const row: Card = {
    id: input.id,
    bookId: input.bookId,
    pageId: input.pageId,
    source: input.source,
    target: input.target,
    createdAt: input.createdAt as number,
  };
  if (input.parentIds !== undefined) row.parentIds = input.parentIds as string[];
  if (input.archivedAt !== undefined) row.archivedAt = input.archivedAt as number;
  return { ok: true, row };
}

function validateReviewRow(input: unknown): RowValidation<ReviewEvent> {
  if (!isObject(input)) return { ok: false, reason: 'row is not an object' };
  if (typeof input.id !== 'string' || input.id.length === 0) {
    return { ok: false, reason: "missing or non-string 'id'" };
  }
  if (typeof input.cardId !== 'string' || input.cardId.length === 0) {
    return { ok: false, reason: "missing or non-string 'cardId'" };
  }
  if (typeof input.pageId !== 'string' || input.pageId.length === 0) {
    return { ok: false, reason: "missing or non-string 'pageId'" };
  }
  if (typeof input.rating !== 'string' || !RATINGS.has(input.rating)) {
    return { ok: false, reason: "'rating' is not a valid enum value" };
  }
  if (!Number.isFinite(input.reviewedAt)) {
    return { ok: false, reason: "'reviewedAt' is not a finite number" };
  }
  const row: ReviewEvent = {
    id: input.id,
    cardId: input.cardId,
    pageId: input.pageId,
    rating: input.rating as ReviewEvent['rating'],
    reviewedAt: input.reviewedAt as number,
  };
  return { ok: true, row };
}

function validateTable<T>(
  rows: unknown[],
  table: MalformedRowTable,
  validator: (input: unknown) => RowValidation<T>,
): { ok: true; rows: T[] } | { ok: false; error: ImportError } {
  const sanitized: T[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const result = validator(rows[i]);
    if (!result.ok) {
      return { ok: false, error: { kind: 'malformed-row', table, index: i + 1, reason: result.reason } };
    }
    sanitized.push(result.row);
  }
  return { ok: true, rows: sanitized };
}

export function parseExport(input: unknown): ParseResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: { kind: 'not-a-backup' } };
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.version !== 'number') {
    return { ok: false, error: { kind: 'not-a-backup' } };
  }
  if (obj.version !== 1) {
    return { ok: false, error: { kind: 'newer-version', version: obj.version } };
  }
  if (typeof obj.exportedAt !== 'number' || !Number.isFinite(obj.exportedAt)) {
    return { ok: false, error: { kind: 'not-a-backup' } };
  }
  if (
    !Array.isArray(obj.books) ||
    !Array.isArray(obj.pages) ||
    !Array.isArray(obj.cards) ||
    !Array.isArray(obj.reviews)
  ) {
    return { ok: false, error: { kind: 'not-a-backup' } };
  }

  const booksResult = validateTable(obj.books, 'books', validateBookRow);
  if (!booksResult.ok) return { ok: false, error: booksResult.error };
  const pagesResult = validateTable(obj.pages, 'pages', validatePageRow);
  if (!pagesResult.ok) return { ok: false, error: pagesResult.error };
  const cardsResult = validateTable(obj.cards, 'cards', validateCardRow);
  if (!cardsResult.ok) return { ok: false, error: cardsResult.error };
  const reviewsResult = validateTable(obj.reviews, 'reviews', validateReviewRow);
  if (!reviewsResult.ok) return { ok: false, error: reviewsResult.error };

  const envelope: ExportEnvelope = {
    version: 1,
    exportedAt: obj.exportedAt,
    books: booksResult.rows,
    pages: pagesResult.rows,
    cards: cardsResult.rows,
    reviews: reviewsResult.rows,
  };
  return { ok: true, envelope };
}

export function validateForeignKeys(
  envelope: ExportEnvelope,
  dbIds: {
    bookIds: ReadonlySet<string>;
    pageIds: ReadonlySet<string>;
    cardIds: ReadonlySet<string>;
  },
): ForeignKeyResult {
  const bookIds = new Set<string>([...dbIds.bookIds, ...envelope.books.map((b) => b.id)]);
  const pageIds = new Set<string>([...dbIds.pageIds, ...envelope.pages.map((p) => p.id)]);
  const cardIds = new Set<string>([...dbIds.cardIds, ...envelope.cards.map((c) => c.id)]);

  for (const page of envelope.pages) {
    if (!bookIds.has(page.bookId)) {
      return { ok: false, error: { kind: 'fk-missing' } };
    }
  }
  for (const card of envelope.cards) {
    if (!bookIds.has(card.bookId) || !pageIds.has(card.pageId)) {
      return { ok: false, error: { kind: 'fk-missing' } };
    }
  }
  for (const ev of envelope.reviews) {
    if (!cardIds.has(ev.cardId) || !pageIds.has(ev.pageId)) {
      return { ok: false, error: { kind: 'fk-missing' } };
    }
  }
  return { ok: true };
}
