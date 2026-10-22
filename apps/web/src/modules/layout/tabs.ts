import type { SidebarTab } from '../tutorial/steps';

export interface SidebarTabDef {
  id: SidebarTab;
  icon: string;
  label: string;
}

/** Pestañas de la barra lateral, en orden (Mayús+1, Mayús+2… abren cada una). */
export function sidebarTabs(isGm: boolean): SidebarTabDef[] {
  return [
    { id: 'chat', icon: '💬', label: 'Chat' },
    { id: 'characters', icon: '🧙', label: 'Personajes' },
    { id: 'journal', icon: '📜', label: 'Diario' },
    ...(isGm ? [{ id: 'scenes' as const, icon: '🗺️', label: 'Escenas' }] : []),
    { id: 'table', icon: '👥', label: 'Mesa' },
    ...(isGm ? [{ id: 'settings' as const, icon: '⚙️', label: 'Ajustes' }] : []),
  ];
}
