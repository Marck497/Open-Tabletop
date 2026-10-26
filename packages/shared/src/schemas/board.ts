import { z } from 'zod';
import { DIAGONAL_RULES, type DiagonalRule } from './measure.js';
import { tokenAiSchema, type TokenAi } from './ai.js';
import type { Wall } from './walls.js';
import { lightSchema, type Light, type LightSource } from './lights.js';
import { triggerSchema, type Trigger } from './triggers.js';

/**
 * Capas del tablero (como en Roll20):
 * - map: fondo y decorado, por debajo de todo.
 * - token: personajes y objetos con los que se interactúa.
 * - gm: solo la ve el DM (notas, trampas, monstruos escondidos).
 */
export const BOARD_LAYERS = ['map', 'token', 'gm'] as const;
export type BoardLayer = (typeof BOARD_LAYERS)[number];

export const fogOpSchema = z.object({
  mode: z.enum(['reveal', 'hide']),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});
export type FogOp = z.infer<typeof fogOpSchema>;

/**
 * Niebla de guerra: todo empieza oculto y se aplican en orden operaciones
 * de "revelar" u "ocultar" rectángulos. La última que cubre un punto manda.
 */
export const fogSchema = z.object({
  enabled: z.boolean(),
  ops: z.array(fogOpSchema).max(5000),
});
export type Fog = z.infer<typeof fogSchema>;

export const DEFAULT_FOG: Fog = { enabled: false, ops: [] };

/** ¿Está visible para los jugadores el punto (x, y)? */
export function isPointRevealed(fog: Fog, x: number, y: number): boolean {
  if (!fog.enabled) return true;
  for (let i = fog.ops.length - 1; i >= 0; i--) {
    const op = fog.ops[i]!;
    if (x >= op.x && x <= op.x + op.w && y >= op.y && y <= op.y + op.h) return op.mode === 'reveal';
  }
  return false;
}

export const sceneInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Tamaño en casillas. */
  widthCells: z.number().int().min(1).max(200),
  heightCells: z.number().int().min(1).max(200),
  /** Tamaño de una casilla en píxeles. */
  gridSize: z.number().int().min(10).max(300),
  gridVisible: z.boolean(),
  gridColor: z.string().max(32),
  backgroundColor: z.string().max(32),
  /** Distancia que representa una casilla (5 en 5e) y su unidad. */
  cellDistance: z.number().positive().max(10000),
  distanceUnit: z.string().trim().max(16),
  diagonalRule: z.enum(DIAGONAL_RULES),
  /** Visión dinámica: cada jugador solo ve lo que ven sus tokens (las paredes tapan). */
  vision: z.boolean(),
  /** Hasta dónde ven los tokens, en casillas (0 = sin límite). */
  visionRange: z.number().int().min(0).max(1000),
  /** Con la visión dinámica, lo ya explorado se queda a la vista, en penumbra. */
  exploration: z.boolean(),
  /** Con la visión dinámica: la escena está a oscuras y solo se ve con luz o con visión en la oscuridad. */
  lighting: z.boolean(),
});
export const createSceneSchema = sceneInputSchema.partial().extend({ name: z.string().trim().min(1).max(80), folderId: z.string().min(1).max(64).nullable().optional() });
export const updateSceneSchema = sceneInputSchema.partial();
export type CreateSceneInput = z.input<typeof createSceneSchema>;
export type UpdateSceneInput = z.input<typeof updateSceneSchema>;

export interface Scene {
  id: string;
  campaignId: string;
  name: string;
  widthCells: number;
  heightCells: number;
  gridSize: number;
  gridVisible: boolean;
  gridColor: string;
  backgroundColor: string;
  cellDistance: number;
  distanceUnit: string;
  diagonalRule: DiagonalRule;
  vision: boolean;
  visionRange: number;
  exploration: boolean;
  lighting: boolean;
  /** Zonas exploradas por los jugadores (ver explored.ts); '' = nada. */
  explored: string;
  sortOrder: number;
  /** Carpeta en la lista de escenas del DM (null = fuera de carpetas). */
  folderId: string | null;
  fog: Fog;
  walls: Wall[];
  /** Suelo pintado por casillas (ver terrain.ts); '' = sin pintar. */
  terrain: string;
}

/** Carpeta de la lista de escenas (solo la ve el DM). Se pueden meter unas dentro de otras. */
export interface SceneFolder {
  id: string;
  campaignId: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export const sceneFolderInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().min(1).max(64).nullable().default(null),
});
export type SceneFolderInput = z.input<typeof sceneFolderInputSchema>;

/** Mover y ordenar escenas y carpetas (arrastrar en la lista). Solo se cambia lo que se manda. */
export const sceneTreeSchema = z.object({
  scenes: z
    .array(z.object({ id: z.string().min(1).max(64), folderId: z.string().min(1).max(64).nullable(), sortOrder: z.number().int() }))
    .max(1000)
    .default([]),
  folders: z
    .array(z.object({ id: z.string().min(1).max(64), parentId: z.string().min(1).max(64).nullable(), sortOrder: z.number().int() }))
    .max(500)
    .default([]),
});
export type SceneTreeInput = z.input<typeof sceneTreeSchema>;

/** Llevar a unos jugadores concretos a una escena (el resto se queda donde está). */
export const movePlayersSchema = z.object({
  sceneId: z.string().min(1).max(64),
  userIds: z.array(z.string().min(1).max(64)).min(1).max(100),
});

/** ¿Meter la carpeta `id` dentro de `parentId` crearía un bucle? */
export function folderCycle(folders: Pick<SceneFolder, 'id' | 'parentId'>[], id: string, parentId: string | null): boolean {
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  for (let cur = parentId, steps = 0; cur; cur = parentOf.get(cur) ?? null, steps++) {
    if (cur === id || steps > folders.length) return true;
  }
  return false;
}

export interface SceneTreeNode {
  folder: SceneFolder;
  folders: SceneTreeNode[];
  scenes: Scene[];
}

/** Árbol de carpetas y escenas, ordenado. Lo que apunta a una carpeta que no existe va a la raíz. */
export function buildSceneTree(folders: SceneFolder[], scenes: Scene[]): { folders: SceneTreeNode[]; scenes: Scene[] } {
  const ids = new Set(folders.map((f) => f.id));
  const byOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  const node = (f: SceneFolder): SceneTreeNode => ({
    folder: f,
    folders: folders.filter((c) => c.parentId === f.id && c.id !== f.id).sort(byOrder).map(node),
    scenes: scenes.filter((s) => s.folderId === f.id).sort(byOrder),
  });
  // Raíz: sin padre, o con un padre que no existe o en bucle.
  const roots = folders.filter((f) => !f.parentId || !ids.has(f.parentId) || folderCycle(folders, f.id, f.parentId));
  return {
    folders: roots.sort(byOrder).map((f) => node({ ...f, parentId: null })),
    scenes: scenes.filter((s) => !s.folderId || !ids.has(s.folderId)).sort(byOrder),
  };
}

/**
 * Dibujos sobre el tablero: trazos a mano alzada, líneas, rectángulos, elipses, textos, sellos (un emoji
 * que ocupa su caja), notas numeradas del DM (un círculo con su número en `text`; título en el nombre y texto en las notas del DM)
 * y zonas de trampas y avisos (un rectángulo; lo que hacen va en `trigger` del elemento).
 */
export const DRAWING_TYPES = ['path', 'line', 'rect', 'ellipse', 'text', 'stamp', 'note', 'zone'] as const;
export type DrawingType = (typeof DRAWING_TYPES)[number];

export const drawingSchema = z.object({
  type: z.enum(DRAWING_TYPES),
  /** Trazo y línea: pares x, y relativos a la esquina del elemento. */
  points: z.array(z.number().finite()).max(4000).default([]),
  stroke: z.string().max(32).default('#e8b25a'),
  /** Relleno de rectángulos y elipses ('' = sin relleno). */
  fill: z.string().max(32).default(''),
  strokeWidth: z.number().min(1).max(50).default(4),
  text: z.string().max(500).default(''),
  fontSize: z.number().min(6).max(400).default(28),
});
export type Drawing = z.infer<typeof drawingSchema>;
export type DrawingInput = z.input<typeof drawingSchema>;

/** Vida de un token para los jugadores: oculta (solo el DM), solo la barra o la barra con números. */
export const HP_VIEWS = ['gm', 'bar', 'numbers'] as const;
export type HpView = (typeof HP_VIEWS)[number];
export const HP_VIEW_LABELS: Record<HpView, string> = { gm: 'Solo el DM', bar: 'Barra sin números', numbers: 'Barra y números' };
export const AC_VIEWS = ['gm', 'all'] as const;
export type AcView = (typeof AC_VIEWS)[number];

export interface TokenStats {
  hp?: number | null;
  hpMax?: number | null;
  hpTemp?: number | null;
  /** Vida actual / máxima (0 a 1). */
  ratio?: number;
  /** PG temporales / vida máxima. */
  tempRatio?: number;
  ac?: number;
}

export const boardItemFields = {
  layer: z.enum(BOARD_LAYERS),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(100000),
  height: z.number().positive().max(100000),
  rotation: z.number(),
  z: z.number().int(),
  /** Imagen subida (asset); si no hay, se dibuja un círculo de color con iniciales. */
  assetId: z.string().nullable(),
  color: z.string().max(32),
  name: z.string().max(80),
  showName: z.boolean(),
  /** Jugadores que pueden mover este token. */
  ownerIds: z.array(z.string()).max(50),
  /** Personaje vinculado (su hoja da nombre, imagen y barras al token). */
  characterId: z.string().nullable(),
  /** Si es un dibujo en vez de un token o una imagen. */
  drawing: drawingSchema.nullable(),
  /** Estados marcados (ids de los estados de la plantilla). */
  statuses: z.array(z.string().max(40)).max(30),
  /** Rondas que le quedan a cada estado (los que no están, duran hasta que se quiten a mano). */
  statusRounds: z.record(z.string().max(40), z.number().int().min(1).max(1000)),
  /** IA del enemigo (solo la ve el DM). */
  ai: tokenAiSchema.nullable(),
  /** Quién ve la vida de la hoja vinculada (null = automático: ver hpViewOf). */
  hpView: z.enum(HP_VIEWS).nullable(),
  /** Quién ve la CA (null = automático). */
  acView: z.enum(AC_VIEWS).nullable(),
  /** Luz que da (antorcha, linterna...); null = ninguna. */
  light: lightSchema.nullable(),
  /** Visión en la oscuridad en la unidad de la escena (0 = no tiene). */
  darkvision: z.number().min(0).max(1000),
  /** Notas privadas del DM (PNJ, trampas, secretos): a los jugadores nunca les llegan. */
  gmNotes: z.string().max(5000),
  /** Trampa o zona de aviso (ver triggers.ts); solo la recibe el DM. */
  trigger: triggerSchema.nullable(),
};

export const createItemSchema = z.object({
  ...boardItemFields,
  rotation: boardItemFields.rotation.default(0),
  z: boardItemFields.z.optional(),
  assetId: boardItemFields.assetId.default(null),
  color: boardItemFields.color.default('#b0413e'),
  name: boardItemFields.name.default(''),
  showName: boardItemFields.showName.default(false),
  ownerIds: boardItemFields.ownerIds.default([]),
  characterId: boardItemFields.characterId.default(null),
  ai: boardItemFields.ai.default(null),
  statuses: boardItemFields.statuses.default([]),
  statusRounds: boardItemFields.statusRounds.default({}),
  drawing: boardItemFields.drawing.default(null),
  hpView: boardItemFields.hpView.default(null),
  acView: boardItemFields.acView.default(null),
  light: boardItemFields.light.default(null),
  darkvision: boardItemFields.darkvision.default(0),
  gmNotes: boardItemFields.gmNotes.default(''),
  trigger: boardItemFields.trigger.default(null),
});
export const updateItemSchema = z.object(boardItemFields).partial();
export type CreateItemInput = z.input<typeof createItemSchema>;
export type UpdateItemInput = z.input<typeof updateItemSchema>;

export interface BoardItem {
  id: string;
  sceneId: string;
  layer: BoardLayer;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  assetId: string | null;
  color: string;
  name: string;
  showName: boolean;
  ownerIds: string[];
  characterId: string | null;
  ai: TokenAi | null;
  statuses: string[];
  statusRounds: Record<string, number>;
  drawing: Drawing | null;
  hpView: HpView | null;
  acView: AcView | null;
  light: Light | null;
  darkvision: number;
  /** Solo lo recibe el DM ('' para los jugadores). */
  gmNotes: string;
  /** Trampa o zona de aviso; solo lo recibe el DM (null para los jugadores). */
  trigger: Trigger | null;
  /** Vida y CA de la hoja vinculada, ya filtradas para quien lo recibe (las calcula el servidor). */
  stats?: TokenStats | null;
}

/** Lo que recibe un cliente al abrir una escena (ya filtrado según su rol). */
export interface SceneState {
  scene: Scene;
  items: BoardItem[];
  /** Escena a oscuras: luces que el jugador necesita para pintar lo que ve (el DM las saca de los elementos). */
  lights?: LightSource[];
}

export interface Asset {
  id: string;
  campaignId: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** URL pública (para miembros) de un asset subido. */
export const assetUrl = (assetId: string) => `/api/assets/${assetId}`;
