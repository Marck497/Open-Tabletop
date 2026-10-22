import { useEffect, useState } from 'react';
import type { ChatMessage } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { useJournal } from '../journal/store';
import type { SidebarTab } from '../tutorial/steps';

/**
 * Cuenta lo que llega a las pestañas que no estás mirando: mensajes del chat de los demás
 * y, para los jugadores, documentos que el DM les acaba de compartir en el diario.
 * Se pone a cero al abrir la pestaña. Con la barra lateral escondida, `visibleTab` es null y cuenta todo.
 */
export function useUnread(campaignId: string, meId: string, isGm: boolean, visibleTab: SidebarTab | null) {
  const [unread, setUnread] = useState<Partial<Record<SidebarTab, number>>>({});

  useEffect(() => {
    if (visibleTab) setUnread((u) => (u[visibleTab] ? { ...u, [visibleTab]: 0 } : u));
  }, [visibleTab]);

  useEffect(() => {
    const bump = (tab: SidebarTab, n = 1) => tab !== visibleTab && setUnread((u) => ({ ...u, [tab]: (u[tab] ?? 0) + n }));
    const socket = getSocket();
    const onMessage = (m: ChatMessage) => m.campaignId === campaignId && m.userId !== meId && bump('chat');
    const onCleared = (p: { campaignId: string }) => p.campaignId === campaignId && setUnread((u) => ({ ...u, chat: 0 }));
    socket.on('chat:message', onMessage);
    socket.on('chat:cleared', onCleared);
    // El DM escribe el diario, así que solo se avisa a los jugadores de lo nuevo que les llega.
    const unsubscribe = isGm
      ? () => {}
      : useJournal.subscribe((s, prev) => {
          if (!prev.loaded || s.handouts === prev.handouts) return;
          const added = Object.keys(s.handouts).filter((id) => !prev.handouts[id]).length;
          if (added) bump('journal', added);
        });
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:cleared', onCleared);
      unsubscribe();
    };
  }, [campaignId, meId, isGm, visibleTab]);

  return unread;
}
