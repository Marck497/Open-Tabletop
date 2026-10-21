import { create } from 'zustand';
import type { InitiativeState } from '@vtt/shared';

export const useInitiative = create<{ state: InitiativeState | null; set: (s: InitiativeState | null) => void }>((set) => ({
  state: null,
  set: (state) => set({ state }),
}));

/** Id del token cuyo turno es ahora (para resaltarlo en el tablero). */
export function useActiveItemId(): string | null {
  return useInitiative((s) => (s.state?.active ? (s.state.entries[s.state.turn]?.itemId ?? null) : null));
}
