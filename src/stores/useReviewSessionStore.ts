import { create } from 'zustand';
import type { Rating } from '../db/db';

type ReviewSessionState = {
  pageId: string | null;
  cardIds: string[];
  index: number;
  flipped: boolean;
  ratings: Record<string, Rating>;
  start: (pageId: string, cardIds: string[]) => void;
  flip: () => void;
  rate: (rating: Rating) => void;
  next: () => void;
  reset: () => void;
};

const initialState = {
  pageId: null,
  cardIds: [],
  index: 0,
  flipped: false,
  ratings: {},
} satisfies Pick<
  ReviewSessionState,
  'pageId' | 'cardIds' | 'index' | 'flipped' | 'ratings'
>;

export const useReviewSessionStore = create<ReviewSessionState>()((set) => ({
  ...initialState,

  start: (pageId, cardIds) =>
    set({
      pageId,
      cardIds: [...cardIds],
      index: 0,
      flipped: false,
      ratings: {},
    }),

  flip: () => set((state) => ({ flipped: !state.flipped })),

  rate: (rating) =>
    set((state) => {
      if (state.pageId === null) return {};
      const cardId = state.cardIds[state.index];
      if (cardId === undefined) return {};
      return { ratings: { ...state.ratings, [cardId]: rating } };
    }),

  next: () =>
    set((state) => {
      if (state.index >= state.cardIds.length) return {};
      return { index: state.index + 1, flipped: false };
    }),

  reset: () => set({ ...initialState }),
}));
