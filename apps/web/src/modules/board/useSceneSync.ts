import { useEffect, useState } from 'react';
import type { ServerToClientEvents } from '@vtt/shared';
import { emitAck, getSocket } from '../../core/socket';
import { useBoard } from './store';

type Payload<K extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[K]>[0];

/**
 * Abre una escena por socket y mantiene el store del tablero sincronizado
 * con los cambios que llegan del servidor.
 */
export function useSceneSync(sceneId: string | null) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const board = useBoard.getState;
    if (!sceneId) {
      board().clear();
      return;
    }
    const socket = getSocket();
    let cancelled = false;

    const open = () =>
      emitAck('scene:view', { sceneId })
        .then((state) => {
          if (cancelled) return;
          setError(null);
          board().load(state);
        })
        .catch((e: Error) => !cancelled && setError(e.message));

    const handlers: { [K in keyof ServerToClientEvents]?: (p: Payload<K>) => void } = {
      'item:upserted': (p) => p.sceneId === sceneId && board().upsert(p.item),
      'item:removed': (p) => p.sceneId === sceneId && board().remove(p.id),
      'item:moving': (p) => p.sceneId === sceneId && board().setMoving(p.id, { x: p.x, y: p.y }),
      'fog:updated': (p) => p.sceneId === sceneId && board().setFog(p.fog),
      'scene:sync': (p) => p.scene.id === sceneId && board().load(p),
      'scene:updated': (p) => p.scene.id === sceneId && board().setScene(p.scene),
      'board:measure': ({ sceneId: sid, measure, ...author }) => sid === sceneId && board().setRemoteMeasure(author, measure),
      'board:ping': ({ sceneId: sid, x, y, focus, ...author }) => sid === sceneId && board().addPing({ ...author, x, y }, focus),
    };

    const entries = Object.entries(handlers) as [keyof ServerToClientEvents, (p: unknown) => void][];
    entries.forEach(([ev, fn]) => socket.on(ev, fn as never));
    socket.on('connect', open);
    if (socket.connected) void open();

    return () => {
      cancelled = true;
      entries.forEach(([ev, fn]) => socket.off(ev, fn as never));
      socket.off('connect', open);
    };
  }, [sceneId]);

  return { error };
}
