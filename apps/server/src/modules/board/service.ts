import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, max } from 'drizzle-orm';
import {
  createItemSchema,
  createSceneSchema,
  fogOpSchema,
  fogSchema,
  updateItemSchema,
  updateSceneSchema,
  movePlayersSchema,
  canMoveStraight,
  movePathSchema,
  hasLineOfSight,
  isDoor,
  wallsSchema,
  terrainSchema,
  resizeTerrain,
  exploreFrom,
  eyeOf,
  lightsOf,
  lightsSeenBy,
  type BoardItem,
  type CampaignRole,
  type CreateItemInput,
  type CreateSceneInput,
  type Fog,
  type FogOp,
  type Point,
  type Scene,
  type SceneFolder,
  type SceneState,
  type UpdateItemInput,
  type UpdateSceneInput,
  type Wall,
  type WallInput,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { assets, boardItems, campaignMembers, campaigns, characters, sceneFolders, scenes } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';
import { createStatsDecorator } from './stats.js';
import { canSeeItem, eyesOf, forViewer, isEye, PLAYER_DRAWING_FIELDS, PLAYER_EDITABLE_FIELDS, sceneFor, sightOf } from './visibility.js';

type SceneRow = typeof scenes.$inferSelect;
type ItemRow = typeof boardItems.$inferSelect;

const toScene = ({ createdAt: _c, ...s }: SceneRow): Scene => s;
const toItem = ({ createdAt: _c, ...i }: ItemRow): BoardItem => i;

export interface Viewer {
  userId: string;
  role: CampaignRole;
}

/** Lógica de escenas, elementos del tablero y niebla. No sabe nada de sockets. */
export function createBoardService(ctx: AppContext) {
  const { db } = ctx;
  const campaignsSvc = createCampaignService(ctx);
  /** Vida y CA de los tokens vinculados, filtradas para cada usuario. */
  const statsFor = createStatsDecorator(ctx);

  function sceneRow(sceneId: string): SceneRow {
    const row = db.select().from(scenes).where(eq(scenes.id, sceneId)).get();
    if (!row) throw notFound('Escena no encontrada');
    return row;
  }

  function activeSceneId(campaignId: string): string | null {
    return db.select({ id: campaigns.activeSceneId }).from(campaigns).where(eq(campaigns.id, campaignId)).get()?.id ?? null;
  }

  /** Comprueba que el usuario puede abrir la escena y devuelve escena + rol. */
  function access(sceneId: string, userId: string): { scene: Scene; viewer: Viewer } {
    const row = sceneRow(sceneId);
    const role = campaignsSvc.getRole(row.campaignId, userId);
    if (!role) throw notFound('Escena no encontrada');
    if (role !== 'gm' && campaignsSvc.sceneOf(row.campaignId, userId) !== sceneId) throw forbidden('El DM no ha abierto esta escena');
    return { scene: toScene(row), viewer: { userId, role } };
  }

  function requireGmScene(sceneId: string, userId: string): Scene {
    const { scene, viewer } = access(sceneId, userId);
    if (viewer.role !== 'gm') throw forbidden('Solo el DM puede hacer esto');
    return scene;
  }

  // ---------- Escenas ----------

  function sceneIdsOf(campaignId: string): string[] {
    return db.select({ id: scenes.id }).from(scenes).where(eq(scenes.campaignId, campaignId)).all().map((r) => r.id);
  }

  function listScenes(campaignId: string, userId: string): { scenes: Scene[]; folders: SceneFolder[]; activeSceneId: string | null } {
    const role = campaignsSvc.requireMember(campaignId, userId);
    const active = role === 'gm' ? activeSceneId(campaignId) : campaignsSvc.sceneOf(campaignId, userId);
    const rows = db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).orderBy(asc(scenes.sortOrder), asc(scenes.createdAt)).all();
    const visible = role === 'gm' ? rows : rows.filter((r) => r.id === active);
    const folders =
      role === 'gm'
        ? db.select().from(sceneFolders).where(eq(sceneFolders.campaignId, campaignId)).orderBy(asc(sceneFolders.sortOrder)).all().map(({ createdAt: _c, ...f }) => f)
        : [];
    return { scenes: visible.map((r) => sceneFor(toScene(r), role)), folders, activeSceneId: active };
  }

  function createScene(campaignId: string, userId: string, input: CreateSceneInput): Scene {
    campaignsSvc.requireGm(campaignId, userId);
    const data = createSceneSchema.parse(input);
    if (data.folderId && db.select({ c: sceneFolders.campaignId }).from(sceneFolders).where(eq(sceneFolders.id, data.folderId)).get()?.c !== campaignId) {
      throw notFound('Carpeta no encontrada');
    }
    const order = db.select({ m: max(scenes.sortOrder) }).from(scenes).where(eq(scenes.campaignId, campaignId)).get()?.m ?? -1;
    const id = randomUUID();
    db.insert(scenes).values({ id, campaignId, ...data, sortOrder: order + 1 }).run();
    return toScene(sceneRow(id));
  }

  function updateScene(sceneId: string, userId: string, input: UpdateSceneInput): Scene {
    const before = requireGmScene(sceneId, userId);
    const data = updateSceneSchema.parse(input);
    const w = data.widthCells ?? before.widthCells;
    const h = data.heightCells ?? before.heightCells;
    // Si cambia el tamaño, el suelo pintado se recorta o se amplía con vacío.
    const terrain = before.terrain && (w !== before.widthCells || h !== before.heightCells) ? { terrain: resizeTerrain(before.terrain, before.widthCells, before.heightCells, w, h) } : {};
    // Lo explorado va por subcasillas: si cambia la cuadrícula, se empieza de cero.
    const resized = w !== before.widthCells || h !== before.heightCells || (data.gridSize ?? before.gridSize) !== before.gridSize;
    if (Object.keys(data).length) db.update(scenes).set({ ...data, ...terrain, ...(resized ? { explored: '' } : {}) }).where(eq(scenes.id, sceneId)).run();
    return toScene(sceneRow(sceneId));
  }

  function deleteScene(sceneId: string, userId: string): { campaignId: string; wasActive: boolean } {
    const scene = requireGmScene(sceneId, userId);
    const wasActive = activeSceneId(scene.campaignId) === sceneId;
    db.transaction((tx) => {
      if (wasActive) tx.update(campaigns).set({ activeSceneId: null }).where(eq(campaigns.id, scene.campaignId)).run();
      // Quien estuviera aparte en esta escena vuelve con la party.
      tx.update(campaignMembers).set({ sceneId: null }).where(and(eq(campaignMembers.campaignId, scene.campaignId), eq(campaignMembers.sceneId, sceneId))).run();
      tx.delete(scenes).where(eq(scenes.id, sceneId)).run();
    });
    return { campaignId: scene.campaignId, wasActive };
  }

  function setActiveScene(campaignId: string, userId: string, sceneId: string | null): { previous: string | null } {
    campaignsSvc.requireGm(campaignId, userId);
    if (sceneId && sceneRow(sceneId).campaignId !== campaignId) throw notFound('Escena no encontrada');
    const previous = activeSceneId(campaignId);
    // "Toda la party": también vuelven los que estaban aparte.
    db.transaction((tx) => {
      tx.update(campaigns).set({ activeSceneId: sceneId }).where(eq(campaigns.id, campaignId)).run();
      tx.update(campaignMembers).set({ sceneId: null }).where(eq(campaignMembers.campaignId, campaignId)).run();
    });
    return { previous };
  }

  /** Lleva a unos jugadores a una escena; el resto se queda donde está. Volver a la de la party los junta de nuevo. */
  function movePlayers(campaignId: string, userId: string, input: unknown): void {
    campaignsSvc.requireGm(campaignId, userId);
    const { sceneId, userIds } = movePlayersSchema.parse(input);
    if (sceneRow(sceneId).campaignId !== campaignId) throw notFound('Escena no encontrada');
    const players = db
      .select({ id: campaignMembers.userId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, 'player'), inArray(campaignMembers.userId, userIds)))
      .all()
      .map((r) => r.id);
    if (players.length !== new Set(userIds).size) throw badRequest('Alguno no es jugador de la partida');
    const own = sceneId === activeSceneId(campaignId) ? null : sceneId;
    db.update(campaignMembers)
      .set({ sceneId: own })
      .where(and(eq(campaignMembers.campaignId, campaignId), inArray(campaignMembers.userId, players)))
      .run();
  }

  // ---------- Estado visible ----------

  function allItems(sceneId: string): BoardItem[] {
    return db.select().from(boardItems).where(eq(boardItems.sceneId, sceneId)).orderBy(asc(boardItems.z)).all().map(toItem);
  }

  function stateFor(scene: Scene, viewer: Viewer): SceneState {
    const items = allItems(scene.id);
    const withStats = statsFor(scene.campaignId);
    const sight = sightOf(items, scene, viewer.role, viewer.userId);
    const bounds = { width: scene.widthCells * scene.gridSize, height: scene.heightCells * scene.gridSize };
    return {
      scene: sceneFor(scene, viewer.role),
      items: items.filter((i) => canSeeItem(i, scene, viewer.role, viewer.userId, sight)).map((i) => withStats(forViewer(i, viewer.role), viewer.role, viewer.userId)),
      // Solo las luces que alumbran algo que ve (no se delata una antorcha tras una pared).
      ...(sight?.lights ? { lights: lightsSeenBy(sight.eyes, sight.lights, scene.walls, scene.visionRange * scene.gridSize, bounds) } : {}),
    };
  }

  function view(sceneId: string, userId: string): SceneState & { viewer: Viewer } {
    const { scene, viewer } = access(sceneId, userId);
    return { ...stateFor(scene, viewer), viewer };
  }

  // ---------- Elementos ----------

  function itemRow(sceneId: string, itemId: string): ItemRow {
    const row = db.select().from(boardItems).where(and(eq(boardItems.id, itemId), eq(boardItems.sceneId, sceneId))).get();
    if (!row) throw notFound('Elemento no encontrado');
    return row;
  }

  function checkAsset(assetId: string | null | undefined, campaignId: string) {
    if (!assetId) return;
    const a = db.select({ campaignId: assets.campaignId }).from(assets).where(eq(assets.id, assetId)).get();
    if (a?.campaignId !== campaignId) throw badRequest('Imagen no válida');
  }

  function checkCharacter(characterId: string | null | undefined, campaignId: string) {
    if (!characterId) return;
    const c = db.select({ campaignId: characters.campaignId }).from(characters).where(eq(characters.id, characterId)).get();
    if (c?.campaignId !== campaignId) throw badRequest('Personaje no válido');
  }

  function createItem(sceneId: string, userId: string, input: CreateItemInput): { scene: Scene; item: BoardItem } {
    const { scene, viewer } = access(sceneId, userId);
    let data = createItemSchema.parse(input);
    if (viewer.role !== 'gm') {
      // Los jugadores solo pueden dibujar, y siempre en la capa de tokens y como dueños de su dibujo.
      if (!data.drawing) throw forbidden('Solo el DM puede añadir elementos');
      data = { ...data, layer: 'token', ownerIds: [userId], characterId: null, assetId: null, ai: null, statuses: [], statusRounds: {}, light: null, trigger: null, gmNotes: '' };
    }
    checkAsset(data.assetId, scene.campaignId);
    checkCharacter(data.characterId, scene.campaignId);
    data = { ...data, statusRounds: Object.fromEntries(Object.entries(data.statusRounds).filter(([k]) => data.statuses.includes(k))) };
    const z = data.z ?? (db.select({ m: max(boardItems.z) }).from(boardItems).where(eq(boardItems.sceneId, sceneId)).get()?.m ?? 0) + 1;
    const id = randomUUID();
    db.insert(boardItems).values({ id, sceneId, ...data, z }).run();
    return { scene, item: toItem(itemRow(sceneId, id)) };
  }

  /** Movimiento/edición. Los jugadores solo pueden mover sus propios tokens. `path`: puntos de giro del movimiento. */
  function updateItem(
    sceneId: string,
    itemId: string,
    userId: string,
    patch: UpdateItemInput,
    path: Point[] = [],
  ): { scene: Scene; before: BoardItem; after: BoardItem } {
    const { scene, viewer } = access(sceneId, userId);
    const data = updateItemSchema.parse(patch);
    const before = toItem(itemRow(sceneId, itemId));
    if (viewer.role !== 'gm') {
      assertPlayerCanEdit(before, scene, viewer, Object.keys(data));
      assertNoWallInTheWay(before, scene, data.x ?? before.x, data.y ?? before.y, path);
    }
    checkAsset(data.assetId, scene.campaignId);
    checkCharacter(data.characterId, scene.campaignId);
    tidyRounds(before, data);
    if (Object.keys(data).length) db.update(boardItems).set(data).where(eq(boardItems.id, itemId)).run();
    return { scene, before, after: toItem(itemRow(sceneId, itemId)) };
  }

  /** Cambio hecho por el propio servidor (p. ej. la IA moviendo un enemigo), sin comprobar permisos. */
  function systemUpdate(sceneId: string, itemId: string, patch: UpdateItemInput): { scene: Scene; before: BoardItem; after: BoardItem } {
    const scene = toScene(sceneRow(sceneId));
    const data = updateItemSchema.parse(patch);
    const before = toItem(itemRow(sceneId, itemId));
    tidyRounds(before, data);
    if (Object.keys(data).length) db.update(boardItems).set(data).where(eq(boardItems.id, itemId)).run();
    return { scene, before, after: toItem(itemRow(sceneId, itemId)) };
  }

  /** Las rondas que quedan solo se guardan para los estados que tiene (al quitar uno, se olvida su duración). */
  function tidyRounds(before: BoardItem, data: UpdateItemInput & { statusRounds?: Record<string, number>; statuses?: string[] }) {
    if (!data.statuses && !data.statusRounds) return;
    const statuses = data.statuses ?? before.statuses;
    const rounds = data.statusRounds ?? before.statusRounds;
    const kept = Object.fromEntries(Object.entries(rounds).filter(([k]) => statuses.includes(k)));
    if (Object.keys(kept).length !== Object.keys(rounds).length || data.statusRounds) data.statusRounds = kept;
  }

  /** Elementos de una escena, sin filtrar (uso interno del servidor). */
  function itemsOf(sceneId: string): { scene: Scene; items: BoardItem[] } {
    return { scene: toScene(sceneRow(sceneId)), items: allItems(sceneId) };
  }

  function assertPlayerCanEdit(item: BoardItem, scene: Scene, viewer: Viewer, keys: string[]) {
    if (!item.ownerIds.includes(viewer.userId) || !canSeeItem(item, scene, viewer.role, viewer.userId)) {
      throw forbidden('Este token no es tuyo');
    }
    const allowed = item.drawing ? PLAYER_DRAWING_FIELDS : PLAYER_EDITABLE_FIELDS;
    if (keys.some((k) => !allowed.has(k))) throw forbidden('Solo puedes mover tus tokens');
  }

  /** Los jugadores no pueden atravesar paredes ni puertas cerradas con sus tokens (se mira cada tramo del recorrido). */
  function assertNoWallInTheWay(item: BoardItem, scene: Scene, x: number, y: number, path: Point[]) {
    const turns = movePathSchema.parse(path);
    if (!isEye(item) || !scene.walls.length || (x === item.x && y === item.y && !turns.length)) return;
    const stops = [{ x: item.x + item.width / 2, y: item.y + item.height / 2 }, ...turns, { x: x + item.width / 2, y: y + item.height / 2 }];
    for (let i = 1; i < stops.length; i++) {
      if (!canMoveStraight(stops[i - 1]!, stops[i]!, scene.walls)) throw forbidden('Hay una pared en medio');
    }
  }

  /** Comprueba que puede arrastrar el token (para el movimiento en vivo, que no se guarda). */
  function canMove(sceneId: string, itemId: string, userId: string): { scene: Scene; item: BoardItem } | null {
    try {
      const { scene, viewer } = access(sceneId, userId);
      const item = toItem(itemRow(sceneId, itemId));
      if (viewer.role !== 'gm') assertPlayerCanEdit(item, scene, viewer, ['x', 'y']);
      return { scene, item };
    } catch {
      return null;
    }
  }

  function deleteItem(sceneId: string, itemId: string, userId: string): { scene: Scene; before: BoardItem } {
    const { scene, viewer } = access(sceneId, userId);
    const before = toItem(itemRow(sceneId, itemId));
    // Un jugador puede borrar sus propios dibujos.
    if (viewer.role !== 'gm' && !(before.drawing && before.ownerIds.includes(userId))) throw forbidden('Solo el DM puede hacer esto');
    db.delete(boardItems).where(eq(boardItems.id, itemId)).run();
    return { scene, before };
  }

  // ---------- Niebla ----------

  function setFog(sceneId: string, userId: string, fog: Fog): Scene {
    requireGmScene(sceneId, userId);
    db.update(scenes).set({ fog: fogSchema.parse(fog) }).where(eq(scenes.id, sceneId)).run();
    return toScene(sceneRow(sceneId));
  }

  function addFogOp(sceneId: string, userId: string, input: FogOp): Scene {
    const scene = requireGmScene(sceneId, userId);
    const op = fogOpSchema.parse(input);
    const w = scene.widthCells * scene.gridSize;
    const h = scene.heightCells * scene.gridSize;
    // Si la operación cubre toda la escena, las anteriores ya no importan.
    const coversAll = op.x <= 0 && op.y <= 0 && op.x + op.w >= w && op.y + op.h >= h;
    const ops = coversAll ? [op] : [...scene.fog.ops, op];
    return setFog(sceneId, userId, { ...scene.fog, ops });
  }

  // ---------- Zonas exploradas ----------

  /**
   * Suma a lo explorado lo que ven ahora los tokens de los jugadores.
   * Devuelve la escena si ha cambiado algo (null si no).
   */
  function explore(sceneId: string): Scene | null {
    const { scene, items } = itemsOf(sceneId);
    if (!scene.vision || !scene.exploration) return null;
    const eyes = items.filter((i) => isEye(i) && i.ownerIds.length > 0).map((i) => eyeOf(i, scene));
    const explored = exploreFrom(scene, scene.explored, eyes, scene.lighting ? lightsOf(items, scene) : null);
    if (explored === null) return null;
    db.update(scenes).set({ explored }).where(eq(scenes.id, sceneId)).run();
    return { ...scene, explored };
  }

  /** El DM olvida lo explorado; se vuelve a marcar lo que ven ahora los tokens. */
  function resetExplored(sceneId: string, userId: string): Scene {
    requireGmScene(sceneId, userId);
    db.update(scenes).set({ explored: '' }).where(eq(scenes.id, sceneId)).run();
    return explore(sceneId) ?? toScene(sceneRow(sceneId));
  }

  // ---------- Paredes y puertas ----------

  function setWalls(sceneId: string, userId: string, input: WallInput[]): Scene {
    requireGmScene(sceneId, userId);
    const walls = wallsSchema.parse(input);
    if (new Set(walls.map((w) => w.id)).size !== walls.length) throw badRequest('Paredes repetidas');
    db.update(scenes).set({ walls }).where(eq(scenes.id, sceneId)).run();
    return toScene(sceneRow(sceneId));
  }

  /** Suelo pintado; con `walls`, también las paredes (para que cambien a la vez). */
  function setTerrain(sceneId: string, userId: string, input: string, wallsInput?: WallInput[]): Scene {
    const scene = requireGmScene(sceneId, userId);
    const terrain = terrainSchema.parse(input);
    if (terrain && terrain.length !== scene.widthCells * scene.heightCells) throw badRequest('El terreno no encaja con el tamaño de la escena');
    const walls = wallsInput === undefined ? undefined : wallsSchema.parse(wallsInput);
    if (walls && new Set(walls.map((w) => w.id)).size !== walls.length) throw badRequest('Paredes repetidas');
    // Sin nada pintado se guarda vacío.
    db.update(scenes)
      .set({ terrain: /[^.]/.test(terrain) ? terrain : '', ...(walls ? { walls } : {}) })
      .where(eq(scenes.id, sceneId))
      .run();
    return toScene(sceneRow(sceneId));
  }

  /** Abrir/cerrar una puerta (y, el DM, echarle la llave). Los jugadores necesitan verla. */
  function toggleDoor(sceneId: string, userId: string, wallId: string, patch: { open?: boolean; locked?: boolean }): Scene {
    const { scene, viewer } = access(sceneId, userId);
    const door = scene.walls.find((w) => w.id === wallId);
    if (!door || !isDoor(door)) throw notFound('Puerta no encontrada');
    if (viewer.role !== 'gm') {
      if (door.kind !== 'door' || patch.locked !== undefined) throw forbidden('Solo el DM puede hacer esto');
      if (door.locked && patch.open !== door.open) throw forbidden('Está cerrada con llave');
      if (scene.vision && !playerSeesWall(scene, door, userId)) throw forbidden('No ves esa puerta');
    }
    const walls: Wall[] = scene.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w));
    db.update(scenes).set({ walls }).where(eq(scenes.id, sceneId)).run();
    return toScene(sceneRow(sceneId));
  }

  function playerSeesWall(scene: Scene, wall: Wall, userId: string) {
    const mid = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
    const range = scene.visionRange * scene.gridSize;
    return eyesOf(allItems(scene.id), userId, scene).some((e) => (!range || Math.hypot(e.x - mid.x, e.y - mid.y) <= range) && hasLineOfSight(e, mid, scene.walls, wall.id));
  }

  return {
    statsFor,
    sceneIdsOf,
    listScenes,
    createScene,
    updateScene,
    deleteScene,
    setActiveScene,
    movePlayers,
    activeSceneId,
    access,
    view,
    stateFor,
    createItem,
    updateItem,
    systemUpdate,
    itemsOf,
    canMove,
    deleteItem,
    setFog,
    addFogOp,
    explore,
    resetExplored,
    setWalls,
    setTerrain,
    toggleDoor,
  };
}

export type BoardService = ReturnType<typeof createBoardService>;
