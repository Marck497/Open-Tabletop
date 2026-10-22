import { create } from 'zustand';
import type { Handout } from '@vtt/shared';

interface JournalState {
  handouts: Record<string, Handout>;
  /** Documento abierto en pantalla. */
  openId: string | null;
  setAll: (list: Handout[]) => void;
  upsert: (h: Handout) => void;
  remove: (id: string) => void;
  open: (id: string | null) => void;
  reset: () => void;
}

export const useJournal = create<JournalState>((set) => ({
  handouts: {},
  openId: null,
  setAll: (list) =>
    set((s) => {
      const handouts = Object.fromEntries(list.map((h) => [h.id, h]));
      return { handouts, openId: s.openId && handouts[s.openId] ? s.openId : null };
    }),
  upsert: (h) => set((s) => ({ handouts: { ...s.handouts, [h.id]: h } })),
  remove: (id) =>
    set((s) => {
      const { [id]: _, ...handouts } = s.handouts;
      return { handouts, openId: s.openId === id ? null : s.openId };
    }),
  open: (openId) => set({ openId }),
  reset: () => set({ handouts: {}, openId: null }),
}));
