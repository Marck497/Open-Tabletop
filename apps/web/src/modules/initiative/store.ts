import { create } from 'zustand';
import type { InitiativeState } from '@vtt/shared';

interface InitiativeStore {
  state: InitiativeState | null;
  /** Se acaba de tirar la iniciativa: se enseña el orden en grande (número que cambia en cada aviso). */
  announce: number;
  set: (s: InitiativeState | null) => void;
  showAnnounce: () => void;
  hideAnnounce: () => void;
}

export const useInitiative = create<InitiativeStore>((set) => ({
  state: null,
  announce: 0,
  set: (state) => set({ state }),
  showAnnounce: () => set((s) => ({ announce: Math.abs(s.announce) + 1 })),
  hideAnnounce: () => set((s) => ({ announce: -Math.abs(s.announce) })),
}));

/** Id del token cuyo turno es ahora (para resaltarlo en el tablero). */
export function useActiveItemId(): string | null {
  return useInitiative((s) => (s.state?.active ? (s.state.entries[s.state.turn]?.itemId ?? null) : null));
}
