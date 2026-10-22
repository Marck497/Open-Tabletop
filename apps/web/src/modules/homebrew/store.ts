import { useEffect } from 'react';
import { create } from 'zustand';
import type { HomebrewEntry } from '@vtt/shared';
import { api } from '../../core/api';
import { getSocket } from '../../core/socket';

interface HomebrewState {
  entries: Record<string, HomebrewEntry>;
  set: (list: HomebrewEntry[]) => void;
  upsert: (e: HomebrewEntry) => void;
}

/** Creaciones que puedo ver en la partida (hechizos, ataques, objetos). */
export const useHomebrew = create<HomebrewState>((set) => ({
  entries: {},
  set: (list) => set({ entries: Object.fromEntries(list.map((e) => [e.id, e])) }),
  upsert: (e) => set((s) => ({ entries: { ...s.entries, [e.id]: e } })),
}));

/** Mantiene las creaciones al día (se recargan cuando alguien cambia una). */
export function useHomebrewSync(campaignId: string) {
  useEffect(() => {
    const load = () =>
      api
        .get<{ entries: HomebrewEntry[] }>(`/campaigns/${campaignId}/homebrew`)
        .then((r) => useHomebrew.getState().set(r.entries))
        .catch(() => undefined);
    void load();
    const socket = getSocket();
    const onChanged = (p: { campaignId: string }) => p.campaignId === campaignId && void load();
    socket.on('homebrew:changed', onChanged);
    socket.on('connect', load);
    return () => {
      socket.off('homebrew:changed', onChanged);
      socket.off('connect', load);
      useHomebrew.getState().set([]);
    };
  }, [campaignId]);
}
