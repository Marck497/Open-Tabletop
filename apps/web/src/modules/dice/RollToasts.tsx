import { useEffect, useState } from 'react';
import type { RollResult } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { RollDetail } from './RollDetail';

const TTL_MS = 8000;

/** Avisos flotantes con las últimas tiradas de la mesa. */
export function RollToasts({ campaignId }: { campaignId: string }) {
  const [rolls, setRolls] = useState<RollResult[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const onRoll = (r: RollResult) => {
      if (r.campaignId !== campaignId) return;
      setRolls((list) => [...list.slice(-4), r]);
      setTimeout(() => setRolls((list) => list.filter((x) => x.id !== r.id)), TTL_MS);
    };
    socket.on('roll:result', onRoll);
    return () => void socket.off('roll:result', onRoll);
  }, [campaignId]);

  return (
    <div className="roll-toasts">
      {rolls.map((r) => (
        <div key={r.id} className="card roll-toast">
          <RollDetail roll={r} />
        </div>
      ))}
    </div>
  );
}
