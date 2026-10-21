import { z } from 'zod';

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
});
export const createSceneSchema = sceneInputSchema.partial().extend({ name: z.string().trim().min(1).max(80) });
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
  sortOrder: number;
  fog: Fog;
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
}

/** Lo que recibe un cliente al abrir una escena (ya filtrado según su rol). */
export interface SceneState {
  scene: Scene;
  items: BoardItem[];
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
