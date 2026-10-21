import { useCallback, useEffect, useState } from 'react';
import type { CampaignDetail, PresenceUser } from '@vtt/shared';
import { api, ApiError } from '../../core/api';
import { getSocket } from '../../core/socket';

/** Carga una partida y se mantiene sincronizada con los cambios que llegan en tiempo real. */
export function useCampaign(campaignId: string) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { campaign } = await api.get<{ campaign: CampaignDetail }>(`/campaigns/${campaignId}`);
      setCampaign(campaign);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'Partida no encontrada o ya no eres miembro' : (err as Error).message);
      setCampaign(null);
    }
  }, [campaignId]);

  useEffect(() => {
    void reload();
    const socket = getSocket();
    const join = () =>
      socket.emit('campaign:join', { campaignId }, (res) => {
        if (res.ok) setOnline(res.data.online);
      });
    const onConnect = () => {
      setConnected(true);
      join();
    };
    const onDisconnect = () => setConnected(false);
    const onPresence = (p: { campaignId: string; online: PresenceUser[] }) => {
      if (p.campaignId === campaignId) setOnline(p.online);
    };
    const onChanged = (p: { campaignId: string }) => {
      if (p.campaignId === campaignId) void reload();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('presence:update', onPresence);
    socket.on('campaign:updated', onChanged);
    socket.on('campaign:membersChanged', onChanged);
    if (socket.connected) onConnect();

    return () => {
      socket.emit('campaign:leave', { campaignId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('presence:update', onPresence);
      socket.off('campaign:updated', onChanged);
      socket.off('campaign:membersChanged', onChanged);
    };
  }, [campaignId, reload]);

  return { campaign, error, online, connected, reload };
}
