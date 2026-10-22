import { useEffect } from 'react';
import type { Handout } from '@vtt/shared';
import { api } from '../../core/api';
import { getSocket } from '../../core/socket';
import { useJournal } from './store';

/** Carga los documentos visibles de la partida y los mantiene al día. */
export function useJournalSync(campaignId: string) {
  useEffect(() => {
    const j = useJournal.getState;
    const load = () => api.get<{ handouts: Handout[] }>(`/campaigns/${campaignId}/handouts`).then((r) => j().setAll(r.handouts));
    void load();
    const socket = getSocket();
    const onUpsert = ({ handout }: { handout: Handout }) => handout.campaignId === campaignId && j().upsert(handout);
    const onRemove = (p: { campaignId: string; id: string }) => p.campaignId === campaignId && j().remove(p.id);
    const onShow = (p: { campaignId: string; id: string }) => p.campaignId === campaignId && j().handouts[p.id] && j().open(p.id);
    const onConnect = () => void load();
    socket.on('handout:upserted', onUpsert);
    socket.on('handout:removed', onRemove);
    socket.on('handout:show', onShow);
    socket.on('connect', onConnect);
    return () => {
      socket.off('handout:upserted', onUpsert);
      socket.off('handout:removed', onRemove);
      socket.off('handout:show', onShow);
      socket.off('connect', onConnect);
      j().reset();
    };
  }, [campaignId]);
}
