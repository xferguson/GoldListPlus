import type { Book, Card, Page, ReviewEvent } from '../../db/db';

export type ExportEnvelope = {
  version: 1;
  exportedAt: number;
  books: Book[];
  pages: Page[];
  cards: Card[];
  reviews: ReviewEvent[];
};

export type ImportError =
  | { kind: 'invalid-json' }
  | { kind: 'not-a-backup' }
  | { kind: 'newer-version'; version: number };

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
  return { ok: true, envelope: input as unknown as ExportEnvelope };
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
