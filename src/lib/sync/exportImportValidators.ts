import type { Book, Card, Page, ReviewEvent } from '../../db/db';

export type MalformedRowTable = 'books' | 'pages' | 'cards' | 'reviews';

export type RowValidation<T> =
  | { ok: true; row: T }
  | { ok: false; reason: string };

export const ID_BAD_CHARS = /[#?/]/;
export const TIERS: ReadonlySet<string> = new Set(['bronze', 'silver', 'gold']);
export const RATINGS: ReadonlySet<string> = new Set(['wrong', 'hard', 'moderate', 'easy']);

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isValidId(value: unknown): value is string {
  return isNonEmptyString(value) && !ID_BAD_CHARS.test(value);
}

export function validateBookRow(input: unknown): RowValidation<Book> {
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

export function validatePageRow(input: unknown): RowValidation<Page> {
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

export function validateCardRow(input: unknown): RowValidation<Card> {
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

export function validateReviewRow(input: unknown): RowValidation<ReviewEvent> {
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

export function validateTable<T>(
  rows: unknown[],
  table: MalformedRowTable,
  validator: (input: unknown) => RowValidation<T>,
): { ok: true; rows: T[] } | { ok: false; error: { kind: 'malformed-row'; table: MalformedRowTable; index: number; reason: string } } {
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
