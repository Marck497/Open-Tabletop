import { create } from 'zustand';
import { GM_TOUR, PLAYER_TOUR, type TourStep } from './steps';

interface TutorialState {
  /** Pasos del recorrido abierto, o null si no hay ninguno. */
  steps: TourStep[] | null;
  index: number;
  start: (role: 'gm' | 'player') => void;
  go: (index: number) => void;
  close: () => void;
}

/** Recorrido guiado: solo se abre a petición (comando /tutorial), nunca solo. */
export const useTutorial = create<TutorialState>((set, get) => ({
  steps: null,
  index: 0,
  start: (role) => set({ steps: role === 'gm' ? GM_TOUR : PLAYER_TOUR, index: 0 }),
  go: (index) => {
    const { steps } = get();
    if (!steps) return;
    if (index >= steps.length) set({ steps: null, index: 0 });
    else set({ index: Math.max(0, index) });
  },
  close: () => set({ steps: null, index: 0 }),
}));
