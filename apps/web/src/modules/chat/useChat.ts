import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage } from '@vtt/shared';
import { api } from '../../core/api';
import { getSocket } from '../../core/socket';

const MAX_IN_MEMORY = 500;

/** Historial del chat + mensajes en vivo. */
export function useChat(campaignId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    () =>
      api.get<{ messages: ChatMessage[] }>(`/campaigns/${campaignId}/chat`).then((r) => {
        setMessages(r.messages);
        setHasMore(r.messages.length >= 100);
      }),
    [campaignId],
  );

  useEffect(() => {
    void load();
    const socket = getSocket();
    const onMessage = (m: ChatMessage) =>
      m.campaignId === campaignId && setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m].slice(-MAX_IN_MEMORY)));
    const onCleared = (p: { campaignId: string }) => p.campaignId === campaignId && setMessages([]);
    const onConnect = () => void load();
    socket.on('chat:message', onMessage);
    socket.on('chat:cleared', onCleared);
    socket.on('connect', onConnect);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:cleared', onCleared);
      socket.off('connect', onConnect);
    };
  }, [campaignId, load]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first) return;
    const r = await api.get<{ messages: ChatMessage[] }>(`/campaigns/${campaignId}/chat?before=${encodeURIComponent(first.createdAt)}`);
    setHasMore(r.messages.length >= 100);
    setMessages((list) => [...r.messages, ...list]);
  };

  return { messages, hasMore, loadOlder };
}
