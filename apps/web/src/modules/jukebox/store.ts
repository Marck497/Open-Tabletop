import { create } from 'zustand';
import type { JukeboxState } from '@vtt/shared';

const VOLUME_KEY = 'vtt:volume';

function readVolume(): { master: number; muted: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? 'null');
    if (v && typeof v.master === 'number') return { master: Math.min(1, Math.max(0, v.master)), muted: !!v.muted };
  } catch {
    /* sin almacenamiento */
  }
  return { master: 0.8, muted: false };
}

interface JukeboxStore {
  state: JukeboxState | null;
  /** Diferencia entre el reloj del servidor y el nuestro (ms). */
  clockOffset: number;
  /** Volumen general de este dispositivo (lo elige cada uno). */
  master: number;
  muted: boolean;
  /** El navegador no deja sonar nada hasta que el usuario toque la página. */
  blocked: boolean;
  set: (state: JukeboxState, serverNow: number) => void;
  setVolume: (v: { master?: number; muted?: boolean }) => void;
  setBlocked: (blocked: boolean) => void;
  reset: () => void;
}

export const useJukebox = create<JukeboxStore>((set) => ({
  state: null,
  clockOffset: 0,
  ...readVolume(),
  blocked: false,
  set: (state, serverNow) => set({ state, clockOffset: serverNow - Date.now() }),
  setVolume: (v) =>
    set((s) => {
      const next = { master: v.master ?? s.master, muted: v.muted ?? s.muted };
      try {
        localStorage.setItem(VOLUME_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    }),
  setBlocked: (blocked) => set({ blocked }),
  reset: () => set({ state: null, blocked: false }),
}));
