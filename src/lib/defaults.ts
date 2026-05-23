import type { BookSettings } from '../db/db';

export const BOOK_NAME_MAX_LENGTH = 80;

export const DEFAULT_BOOK_SETTINGS: BookSettings = {
  distillationIntervalDays: 14,
  headlistSize: 25,
  autoDropOnHard: false,
  autoDropOnModerate: true,
  autoDropOnEasy: true,
};
