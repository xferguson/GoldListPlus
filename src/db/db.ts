import Dexie from 'dexie';
import type { Table } from 'dexie';

export type Tier = 'bronze' | 'silver' | 'gold';
export type Rating = 'wrong' | 'hard' | 'moderate' | 'easy';

export type BookSettings = {
  distillationIntervalDays: number;
  headlistSize: number;
  autoDropOnEasy: boolean;
  autoDropOnModerate: boolean;
  autoDropOnHard: boolean;
};

export type Book = {
  id: string;
  name: string;
  sourceLang: string;
  targetLang: string;
  settings: BookSettings;
  createdAt: number;
};

export type Page = {
  id: string;
  bookId: string;
  title: string;
  tier: Tier;
  createdAt: number;
  reviewableAt: number | null;
  reviewedAt?: number;
  cardIds: string[];
  parentPageId?: string;
  childPageId?: string;
  lastNotifiedAt?: number;
};

export type Card = {
  id: string;
  bookId: string;
  pageId: string;
  source: string;
  target: string;
  createdAt: number;
  parentIds?: string[];
  archivedAt?: number;
};

export type ReviewEvent = {
  id: string;
  cardId: string;
  pageId: string;
  rating: Rating;
  reviewedAt: number;
};

export class GoldListDb extends Dexie {
  books!: Table<Book, string>;
  pages!: Table<Page, string>;
  cards!: Table<Card, string>;
  reviews!: Table<ReviewEvent, string>;

  constructor() {
    super('GoldListPlus');
    this.version(1).stores({
      books: 'id',
      pages: 'id, bookId, reviewableAt, [bookId+tier]',
      cards: 'id, pageId, bookId, archivedAt',
      reviews: 'id, cardId, pageId, reviewedAt',
    });
  }
}

export const db = new GoldListDb();
