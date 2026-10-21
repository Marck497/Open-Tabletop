import { useEffect, useState } from 'react';
import type { ChatMessage } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { RollDetail } from './RollDetail';

const TTL_MS = 6000;

/** Avisos flotantes con las últimas tiradas (útil cuando el chat no está a la vista). */
export function RollToasts({ campaignId }: { campaignId: string }) {
  const [rolls, setRolls] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (m: ChatMessage) => {
      if (m.campaignId !== campaignId || m.kind !== 'roll') return;
      setRolls((list) => [...list.slice(-3), m]);
      setTimeout(() => setRolls((list) => list.filter((x) => x.id !== m.id)), TTL_MS);
    };
    socket.on('chat:message', onMessage);
    return () => void socket.off('chat:message', onMessage);
  }, [campaignId]);

  return (
    <div className="roll-toasts">
      {rolls.map((m) => (
        <div key={m.id} className="card roll-toast">
          <RollDetail message={m} roll={m.roll!} />
        </div>
      ))}
    </div>
  );
}
