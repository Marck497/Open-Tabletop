import { useEffect } from 'react';
import { naturalOutcome, type BoardFx, type ChatMessage } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { useBoard } from '../board/store';
import { useFx } from '../dice/CritFx';
import { playSfx } from './synth';

/** Lo que tarda el proyectil en llegar (s), igual que la animación del tablero. */
function travelOf(fx: BoardFx, grid: number) {
  if (!fx.from || !['arrow', 'bolt', 'burst'].includes(fx.style)) return 0;
  const dests = fx.style === 'burst' && fx.area ? [fx.area.points[0]!] : fx.to;
  if (!dests.length) return 0;
  const far = Math.max(...dests.map((d) => Math.hypot(d.x - fx.from!.x, d.y - fx.from!.y)));
  return Math.max(250, Math.min(650, (far / (grid * 14)) * 1000)) / 1000;
}

/**
 * Sonidos de la mesa: dados al tirar, el de cada ataque o hechizo que se anima en el tablero
 * (tajo, flecha, explosión, curación...) y las puertas al abrirse o cerrarse. Los de críticos y
 * pifias los pone su animación. Se apagan en Mesa → Efectos.
 */
export function SfxListener({ campaignId }: { campaignId: string }) {
  useEffect(() => {
    const socket = getSocket();
    const on = () => useFx.getState().sound;

    const onMessage = (m: ChatMessage) => {
      if (m.campaignId !== campaignId || m.kind !== 'roll' || !on()) return;
      playSfx('dice');
      // Sin la animación de críticos, al menos se oye.
      const nat = useFx.getState().enabled ? null : naturalOutcome(m.roll);
      if (nat) playSfx(nat, { delay: 0.4 });
    };
    const onFx = ({ sceneId, fx }: { sceneId: string; fx: BoardFx }) => {
      const scene = useBoard.getState().scene;
      if (!on() || sceneId !== scene?.id) return;
      // Un poco después de los dados, para que no se pisen.
      setTimeout(() => playSfx(fx.style, { delay: travelOf(fx, scene.gridSize), crit: fx.crit }), 250);
    };

    // Puertas: se oye cuando cambia el «open» de una puerta que ya estaba (no al dibujar paredes).
    const unsub = useBoard.subscribe((s, prev) => {
      if (!on() || !s.scene || s.scene === prev.scene || s.scene.id !== prev.scene?.id) return;
      const before = new Map(prev.scene.walls.map((w) => [w.id, w.open]));
      const flipped = s.scene.walls.find((w) => before.has(w.id) && before.get(w.id) !== w.open);
      if (flipped) playSfx(flipped.open ? 'door-open' : 'door-close');
    });

    socket.on('chat:message', onMessage);
    socket.on('board:fx', onFx);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('board:fx', onFx);
      unsub();
    };
  }, [campaignId]);
  return null;
}
