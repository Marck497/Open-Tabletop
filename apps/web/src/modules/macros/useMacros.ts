import { useEffect, useState } from 'react';
import type { Macro } from '@vtt/shared';
import { api } from '../../core/api';
import { getSocket } from '../../core/socket';

/** Macros que puedo ver en la partida, al día. */
export function useMacros(campaignId: string) {
  const [macros, setMacros] = useState<Macro[]>([]);
  useEffect(() => {
    const load = () => api.get<{ macros: Macro[] }>(`/campaigns/${campaignId}/macros`).then((r) => setMacros(r.macros));
    void load();
    const socket = getSocket();
    const onChanged = (p: { campaignId: string }) => p.campaignId === campaignId && void load();
    socket.on('macros:changed', onChanged);
    socket.on('connect', load);
    return () => {
      socket.off('macros:changed', onChanged);
      socket.off('connect', load);
    };
  }, [campaignId]);
  return macros;
}
