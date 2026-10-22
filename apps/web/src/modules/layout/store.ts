import { create } from 'zustand';
import type { SidebarTab } from '../tutorial/steps';

/** Disposición de la mesa en este navegador: pestaña abierta, ancho y visibilidad de la barra lateral. */
interface LayoutState {
  tab: SidebarTab;
  sideWidth: number;
  sideHidden: boolean;
  /** `remember: false` cambia de pestaña sin guardarla (lo usa el recorrido guiado). */
  setTab: (tab: SidebarTab, remember?: boolean) => void;
  /** Vuelve a la pestaña guardada (al acabar el recorrido). */
  restoreTab: () => void;
  setSideWidth: (w: number) => void;
  toggleSide: (hidden?: boolean) => void;
}

export const SIDE_MIN = 240;
export const SIDE_MAX = 640;
const SIDE_DEFAULT = 300;

const KEYS = { tab: 'vtt:sidebarTab', width: 'vtt:sidebarWidth', hidden: 'vtt:sidebarHidden' };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export const clampSide = (w: number) => Math.round(Math.max(SIDE_MIN, Math.min(SIDE_MAX, w)));
const savedTab = () => (read(KEYS.tab) as SidebarTab | null) ?? 'chat';

export const useLayout = create<LayoutState>((set) => ({
  tab: savedTab(),
  sideWidth: clampSide(Number(read(KEYS.width)) || SIDE_DEFAULT),
  sideHidden: read(KEYS.hidden) === '1',
  setTab: (tab, remember = true) => {
    if (remember) write(KEYS.tab, tab);
    set({ tab });
  },
  restoreTab: () => set({ tab: savedTab() }),
  setSideWidth: (w) => {
    const sideWidth = clampSide(w);
    write(KEYS.width, String(sideWidth));
    set({ sideWidth });
  },
  toggleSide: (hidden) =>
    set((s) => {
      const sideHidden = hidden ?? !s.sideHidden;
      write(KEYS.hidden, sideHidden ? '1' : '0');
      return { sideHidden };
    }),
}));
