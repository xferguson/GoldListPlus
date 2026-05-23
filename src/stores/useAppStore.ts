import { create } from 'zustand';

type AppState = {
  currentBookId: string | null;
  setCurrentBookId: (id: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  currentBookId: null,
  setCurrentBookId: (id) => set({ currentBookId: id }),
}));
