import { useEffect } from 'react';
import type { InitiativeState } from '@vtt/shared';
import { emitAck, getSocket } from '../../core/socket';
import { useInitiative } from './store';

export function useInitiativeSync(campaignId: string) {
  useEffect(() => {
    const { set } = useInitiative.getState();
    const socket = getSocket();
    const load = () => emitAck('initiative:get', { campaignId }).then(set, () => undefined);
    const onUpdate = (s: InitiativeState) => s.campaignId === campaignId && set(s);
    const onAnnounce = (p: { campaignId: string }) => p.campaignId === campaignId && useInitiative.getState().showAnnounce();
    socket.on('initiative:updated', onUpdate);
    socket.on('initiative:announce', onAnnounce);
    socket.on('connect', load);
    if (socket.connected) void load();
    return () => {
      socket.off('initiative:updated', onUpdate);
      socket.off('initiative:announce', onAnnounce);
      socket.off('connect', load);
      set(null);
    };
  }, [campaignId]);
}
