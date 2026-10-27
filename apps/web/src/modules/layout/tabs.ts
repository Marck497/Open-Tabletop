import type { SidebarTab } from '../tutorial/steps';
import { tr } from '../../core/i18n';

export interface SidebarTabDef {
  id: SidebarTab;
  icon: string;
  label: string;
}

/** Pestañas de la barra lateral, en orden (Mayús+1, Mayús+2… abren cada una). */
export function sidebarTabs(isGm: boolean): SidebarTabDef[] {
  return [
    { id: 'chat', icon: '💬', label: tr('Chat') },
    { id: 'characters', icon: '🧙', label: tr('Personajes') },
    { id: 'journal', icon: '📜', label: tr('Diario') },
    ...(isGm ? [{ id: 'scenes' as const, icon: '🗺️', label: tr('Escenas') }] : []),
    { id: 'table', icon: '👥', label: tr('Mesa') },
    ...(isGm ? [{ id: 'settings' as const, icon: '⚙️', label: tr('Ajustes') }] : []),
  ];
}
