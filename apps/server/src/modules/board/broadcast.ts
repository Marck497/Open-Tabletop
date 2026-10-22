import { campaignRoom, sceneRoom, type BoardItem, type CampaignRole, type Scene, type ServerToClientEvents } from '@vtt/shared';
import type { AppContext, IoSocket } from '../../core/module.js';
import { createCampaignService } from '../campaigns/service.js';
import { canSeeItem, eyesOf, forViewer, isEye } from './visibility.js';
import type { BoardService } from './service.js';

/**
 * Envía los cambios del tablero a cada socket de la escena según lo que puede ver.
 * Un mismo cambio puede llegar como "aparece", "cambia" o "desaparece" según el rol.
 */
export function createBoardBroadcaster(ctx: AppContext, board: BoardService) {
  const campaigns = createCampaignService(ctx);

  async function socketsWithRole(scene: Scene) {
    if (!ctx.io) return [];
    const sockets = await ctx.io.in(sceneRoom(scene.id)).fetchSockets();
    const roles = new Map<string, CampaignRole | null>();
    return sockets.flatMap((s) => {
      const userId = s.data.user.id;
      if (!roles.has(userId)) roles.set(userId, campaigns.getRole(scene.campaignId, userId));
      const role = roles.get(userId);
      return role ? [{ socket: s, userId, role }] : [];
    });
  }

  /** Con visión dinámica, desde dónde ve cada jugador (se calcula una vez por cambio). */
  function eyesFor(scene: Scene) {
    if (!scene.vision) return () => undefined;
    const items = board.itemsOf(scene.id).items;
    const cache = new Map<string, ReturnType<typeof eyesOf>>();
    return (userId: string) => {
      if (!cache.has(userId)) cache.set(userId, eyesOf(items, userId));
      return cache.get(userId);
    };
  }

  async function itemChanged(scene: Scene, before: BoardItem | null, after: BoardItem | null) {
    const eyes = eyesFor(scene);
    const movesEye = (i: BoardItem | null, userId: string) => !!i && isEye(i) && i.ownerIds.includes(userId);
    const withStats = board.statsFor(scene.campaignId);
    for (const { socket, userId, role } of await socketsWithRole(scene)) {
      // Si se mueve (o aparece, o se va) uno de sus tokens, cambia todo lo que ve: se le manda la escena entera.
      if (scene.vision && role !== 'gm' && (movesEye(before, userId) || movesEye(after, userId))) {
        socket.emit('scene:sync', board.stateFor(scene, { userId, role }));
        continue;
      }
      const seesAfter = after && canSeeItem(after, scene, role, userId, eyes(userId));
      const seesBefore = before && canSeeItem(before, scene, role, userId, eyes(userId));
      if (seesAfter) socket.emit('item:upserted', { sceneId: scene.id, item: withStats(forViewer(after, role), role, userId) });
      else if (seesBefore) socket.emit('item:removed', { sceneId: scene.id, id: before.id });
    }
  }

  async function itemMoving(scene: Scene, item: BoardItem, x: number, y: number, from: IoSocket | null) {
    const moved = { ...item, x, y };
    const eyes = eyesFor(scene);
    for (const { socket, userId, role } of await socketsWithRole(scene)) {
      if (socket.id === from?.id) continue;
      // Si el token entra o sale de la niebla durante el arrastre, se resuelve al soltarlo.
      if (canSeeItem(moved, scene, role, userId, eyes(userId))) socket.emit('item:moving', { sceneId: scene.id, id: item.id, x, y });
    }
  }

  /** Tras cambiar la niebla: el DM recibe la niebla nueva, los jugadores el estado completo refiltrado. */
  async function fogChanged(scene: Scene) {
    for (const { socket, userId, role } of await socketsWithRole(scene)) {
      if (role === 'gm') socket.emit('fog:updated', { sceneId: scene.id, fog: scene.fog });
      else socket.emit('scene:sync', board.stateFor(scene, { userId, role }));
    }
  }

  /**
   * Tras cambiar la escena (o sus paredes): el DM recibe la escena; los jugadores, el estado
   * completo refiltrado (las paredes y la visión cambian lo que ven). `listChanged` avisa
   * además a toda la partida para que refresque la lista de escenas.
   */
  async function sceneUpdated(scene: Scene, listChanged = true) {
    for (const { socket, userId, role } of await socketsWithRole(scene)) {
      if (role === 'gm') socket.emit('scene:updated', { scene });
      else socket.emit('scene:sync', board.stateFor(scene, { userId, role }));
    }
    if (listChanged) ctx.io?.to(campaignRoom(scene.campaignId)).emit('scenes:changed', { campaignId: scene.campaignId });
  }

  /**
   * Tras mover jugadores de escena: cada jugador conectado deja de escuchar las escenas
   * que ya no son la suya (su web pide la nueva al recibir scene:activeChanged).
   */
  async function syncPlayerRooms(campaignId: string) {
    if (!ctx.io) return;
    const rooms = board.sceneIdsOf(campaignId).map(sceneRoom);
    for (const s of await ctx.io.in(campaignRoom(campaignId)).fetchSockets()) {
      const userId = s.data.user.id;
      if (campaigns.getRole(campaignId, userId) !== 'player') continue;
      const mine = campaigns.sceneOf(campaignId, userId);
      for (const room of rooms) if (s.rooms.has(room) && room !== (mine ? sceneRoom(mine) : null)) s.leave(room);
    }
  }

  /** Reenvía un evento efímero (regla, ping) al resto de la escena; con `gmOnly`, solo a los DM. */
  async function relay<K extends 'board:measure' | 'board:ping'>(
    scene: Scene,
    from: IoSocket,
    event: K,
    payload: Parameters<ServerToClientEvents[K]>[0],
    gmOnly = false,
  ) {
    for (const { socket, role } of await socketsWithRole(scene)) {
      if (socket.id === from.id || (gmOnly && role !== 'gm')) continue;
      (socket.emit as (ev: K, p: typeof payload) => void)(event, payload);
    }
  }

  /** Ha cambiado una hoja (o la plantilla, si `characterId` es null): se reenvían los tokens vinculados con su vida nueva. */
  async function characterChanged(campaignId: string, characterId: string | null) {
    if (!ctx.io) return;
    for (const sceneId of board.sceneIdsOf(campaignId)) {
      const { scene, items } = board.itemsOf(sceneId);
      const linked = items.filter((i) => i.characterId && (characterId === null || i.characterId === characterId));
      if (!linked.length || !(await ctx.io.in(sceneRoom(sceneId)).fetchSockets()).length) continue;
      for (const item of linked) await itemChanged(scene, item, item);
    }
  }

  /** Quién está mirando la escena y qué elementos puede ver cada uno (para efectos que no se guardan). */
  async function viewers(scene: Scene) {
    const eyes = eyesFor(scene);
    return (await socketsWithRole(scene)).map((v) => ({ ...v, sees: (item: BoardItem) => canSeeItem(item, scene, v.role, v.userId, eyes(v.userId)) }));
  }

  return { characterChanged, itemChanged, itemMoving, fogChanged, sceneUpdated, syncPlayerRooms, relay, viewers };
}
