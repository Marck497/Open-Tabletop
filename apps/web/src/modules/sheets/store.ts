import { create } from 'zustand';
import type { Character, SheetTemplate } from '@vtt/shared';

interface SheetsState {
  template: SheetTemplate | null;
  characters: Record<string, Character>;
  /** Hojas abiertas en pantalla (de la más antigua a la más reciente). */
  open: string[];

  setTemplate: (t: SheetTemplate) => void;
  setCharacters: (list: Character[]) => void;
  upsert: (c: Character) => void;
  remove: (id: string) => void;
  /** Cambio local inmediato mientras se guarda en el servidor. */
  patchValues: (id: string, values: Character['values']) => void;
  openSheet: (id: string) => void;
  closeSheet: (id: string) => void;
  reset: () => void;
}

export const useSheets = create<SheetsState>((set) => ({
  template: null,
  characters: {},
  open: [],
  setTemplate: (template) => set({ template }),
  setCharacters: (list) =>
    set((s) => {
      const characters = Object.fromEntries(list.map((c) => [c.id, c]));
      return { characters, open: s.open.filter((id) => characters[id]) };
    }),
  upsert: (c) => set((s) => ({ characters: { ...s.characters, [c.id]: c } })),
  remove: (id) =>
    set((s) => {
      const { [id]: _, ...characters } = s.characters;
      return { characters, open: s.open.filter((o) => o !== id) };
    }),
  patchValues: (id, values) =>
    set((s) => {
      const c = s.characters[id];
      return c ? { characters: { ...s.characters, [id]: { ...c, values: { ...c.values, ...values } } } } : {};
    }),
  openSheet: (id) => set((s) => ({ open: [...s.open.filter((o) => o !== id), id].slice(-3) })),
  closeSheet: (id) => set((s) => ({ open: s.open.filter((o) => o !== id) })),
  reset: () => set({ template: null, characters: {}, open: [] }),
}));
