import { randomUUID } from 'node:crypto';
import { and, asc, eq, max } from 'drizzle-orm';
import {
  createItemSchema,
  createSceneSchema,
  fogOpSchema,
  fogSchema,
  updateItemSchema,
  updateSceneSchema,
  type BoardItem,
  type CampaignRole,
  type CreateItemInput,
  type CreateSceneInput,
  type Fog,
  type FogOp,
  type Scene,
  type SceneState,
  type UpdateItemInput,
  type UpdateSceneInput,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { assets, boardItems, campaigns, characters, scenes } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';
import { canSeeItem, PLAYER_EDITABLE_FIELDS } from './visibility.js';

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
    if (role !== 'gm' && activeSceneId(row.campaignId) !== sceneId) throw forbidden('El DM no ha abierto esta escena');
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

  function listScenes(campaignId: string, userId: string): { scenes: Scene[]; activeSceneId: string | null } {
    const role = campaignsSvc.requireMember(campaignId, userId);
    const active = activeSceneId(campaignId);
    const rows = db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).orderBy(asc(scenes.sortOrder), asc(scenes.createdAt)).all();
    const visible = role === 'gm' ? rows : rows.filter((r) => r.id === active);
    return { scenes: visible.map(toScene), activeSceneId: active };
  }

  function createScene(campaignId: string, userId: string, input: CreateSceneInput): Scene {
    campaignsSvc.requireGm(campaignId, userId);
    const data = createSceneSchema.parse(input);
    const order = db.select({ m: max(scenes.sortOrder) }).from(scenes).where(eq(scenes.campaignId, campaignId)).get()?.m ?? -1;
    const id = randomUUID();
    db.insert(scenes).values({ id, campaignId, ...data, sortOrder: order + 1 }).run();
    return toScene(sceneRow(id));
  }

  function updateScene(sceneId: string, userId: string, input: UpdateSceneInput): Scene {
    requireGmScene(sceneId, userId);
    const data = updateSceneSchema.parse(input);
    if (Object.keys(data).length) db.update(scenes).set(data).where(eq(scenes.id, sceneId)).run();
    return toScene(sceneRow(sceneId));
  }

  function deleteScene(sceneId: string, userId: string): { campaignId: string; wasActive: boolean } {
    const scene = requireGmScene(sceneId, userId);
    const wasActive = activeSceneId(scene.campaignId) === sceneId;
    db.transaction((tx) => {
      if (wasActive) tx.update(campaigns).set({ activeSceneId: null }).where(eq(campaigns.id, scene.campaignId)).run();
      tx.delete(scenes).where(eq(scenes.id, sceneId)).run();
    });
    return { campaignId: scene.campaignId, wasActive };
  }

  function setActiveScene(campaignId: string, userId: string, sceneId: string | null): { previous: string | null } {
    campaignsSvc.requireGm(campaignId, userId);
    if (sceneId && sceneRow(sceneId).campaignId !== campaignId) throw notFound('Escena no encontrada');
    const previous = activeSceneId(campaignId);
    db.update(campaigns).set({ activeSceneId: sceneId }).where(eq(campaigns.id, campaignId)).run();
    return { previous };
  }

  // ---------- Estado visible ----------

  function allItems(sceneId: string): BoardItem[] {
    return db.select().from(boardItems).where(eq(boardItems.sceneId, sceneId)).orderBy(asc(boardItems.z)).all().map(toItem);
  }

  function stateFor(scene: Scene, viewer: Viewer): SceneState {
    return { scene, items: allItems(scene.id).filter((i) => canSeeItem(i, scene, viewer.role, viewer.userId)) };
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
    const scene = requireGmScene(sceneId, userId);
    const data = createItemSchema.parse(input);
    checkAsset(data.assetId, scene.campaignId);
    checkCharacter(data.characterId, scene.campaignId);
    const z = data.z ?? (db.select({ m: max(boardItems.z) }).from(boardItems).where(eq(boardItems.sceneId, sceneId)).get()?.m ?? 0) + 1;
    const id = randomUUID();
    db.insert(boardItems).values({ id, sceneId, ...data, z }).run();
    return { scene, item: toItem(itemRow(sceneId, id)) };
  }

  /** Movimiento/edición. Los jugadores solo pueden mover sus propios tokens. */
  function updateItem(
    sceneId: string,
    itemId: string,
    userId: string,
    patch: UpdateItemInput,
  ): { scene: Scene; before: BoardItem; after: BoardItem } {
    const { scene, viewer } = access(sceneId, userId);
    const data = updateItemSchema.parse(patch);
    const before = toItem(itemRow(sceneId, itemId));
    if (viewer.role !== 'gm') assertPlayerCanEdit(before, scene, viewer, Object.keys(data));
    checkAsset(data.assetId, scene.campaignId);
    checkCharacter(data.characterId, scene.campaignId);
    if (Object.keys(data).length) db.update(boardItems).set(data).where(eq(boardItems.id, itemId)).run();
    return { scene, before, after: toItem(itemRow(sceneId, itemId)) };
  }

  function assertPlayerCanEdit(item: BoardItem, scene: Scene, viewer: Viewer, keys: string[]) {
    if (!item.ownerIds.includes(viewer.userId) || !canSeeItem(item, scene, viewer.role, viewer.userId)) {
      throw forbidden('Este token no es tuyo');
    }
    if (keys.some((k) => !PLAYER_EDITABLE_FIELDS.has(k))) throw forbidden('Solo puedes mover tus tokens');
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
    const scene = requireGmScene(sceneId, userId);
    const before = toItem(itemRow(sceneId, itemId));
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

  return {
    sceneIdsOf,
    listScenes,
    createScene,
    updateScene,
    deleteScene,
    setActiveScene,
    activeSceneId,
    access,
    view,
    stateFor,
    createItem,
    updateItem,
    canMove,
    deleteItem,
    setFog,
    addFogOp,
  };
}

export type BoardService = ReturnType<typeof createBoardService>;
