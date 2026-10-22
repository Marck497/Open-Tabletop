import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { measureSchema, type BoardItem, type FxCue, type FxTarget } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { createBoardBroadcaster } from '../board/broadcast.js';
import { createBoardService } from '../board/service.js';

const MAX_TARGETS = 20;

export const fxTargetSchema = z.object({
  sceneId: z.string().min(1).max(64),
  targetIds: z.array(z.string().min(1).max(64)).max(MAX_TARGETS).default([]),
  area: measureSchema.nullish(),
});

const center = (i: BoardItem) => ({ x: i.x + i.width / 2, y: i.y + i.height / 2 });

export interface PlayFx {
  userId: string;
  campaignId: string;
  target: FxTarget;
  cue: FxCue;
  /** Token que ataca; si no se da, el primero del personaje en la escena. */
  originItemId?: string | null;
  characterId?: string | null;
  /** Tirada secreta: solo lo ven el DM y quien la hace. */
  secret?: boolean;
}

/**
 * Animaciones de ataques y hechizos en el tablero. No se guardan: se mandan a quien mira la
 * escena con solo lo que puede ver (un token oculto no revela desde dónde ataca ni a quién).
 */
export function createFxService(ctx: AppContext) {
  const board = createBoardService(ctx);
  const broadcaster = createBoardBroadcaster(ctx, board);

  async function play(p: PlayFx): Promise<void> {
    if (!ctx.io) return;
    let scene;
    try {
      // Quien ataca tiene que poder ver esa escena (los jugadores, solo la suya).
      scene = board.access(p.target.sceneId, p.userId).scene;
    } catch {
      return;
    }
    if (scene.campaignId !== p.campaignId) return;
    const items = board.itemsOf(scene.id).items.filter((i) => !i.drawing && i.layer !== 'map');
    const origin =
      (p.originItemId && items.find((i) => i.id === p.originItemId)) ||
      (p.characterId && items.find((i) => i.characterId === p.characterId && i.layer === 'token')) ||
      (p.characterId && items.find((i) => i.characterId === p.characterId)) ||
      null;
    const targets = [...new Set(p.target.targetIds)]
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is BoardItem => !!i && i.id !== origin?.id)
      .slice(0, MAX_TARGETS);
    const area = p.target.area && p.target.area.shape !== 'ruler' ? p.target.area : null;
    if (!origin && !targets.length && !area) return;

    const id = randomUUID();
    for (const { socket, userId, role, sees } of await broadcaster.viewers(scene)) {
      if (p.secret && role !== 'gm' && userId !== p.userId) continue;
      const from = origin && sees(origin) ? center(origin) : null;
      const to = targets.filter(sees).map((i) => ({ ...center(i), r: Math.max(i.width, i.height) / 2 }));
      if (!from && !to.length && !area) continue;
      socket.emit('board:fx', { sceneId: scene.id, fx: { id, ...p.cue, from, to, area } });
    }
  }

  return { play };
}
