import { isPointRevealed, seesRect, wallsForPlayer, type BoardItem, type CampaignRole, type Point, type Scene } from '@vtt/shared';

/** ¿Es un token que "mira" (cuenta para la visión dinámica)? */
export const isEye = (item: BoardItem) => item.layer === 'token' && !item.drawing;

/** Desde dónde ve un jugador con la visión dinámica: el centro de cada token suyo. */
export function eyesOf(items: BoardItem[], userId: string): Point[] {
  return items.filter((i) => isEye(i) && i.ownerIds.includes(userId)).map((i) => ({ x: i.x + i.width / 2, y: i.y + i.height / 2 }));
}

/**
 * Decide si un usuario puede ver un elemento del tablero. Se aplica SIEMPRE en el
 * servidor: a los jugadores ni siquiera les llegan los datos de lo que no deben ver.
 * Con la visión dinámica activada hace falta `eyes` (los tokens del jugador): sin ellos no ve nada ajeno.
 */
export function canSeeItem(item: BoardItem, scene: Scene, role: CampaignRole, userId: string, eyes?: Point[]): boolean {
  if (role === 'gm') return true;
  if (item.layer === 'gm') return false;
  if (item.layer === 'token' && !item.ownerIds.includes(userId)) {
    if (!isPointRevealed(scene.fog, item.x + item.width / 2, item.y + item.height / 2)) return false;
    if (scene.vision) return seesRect(eyes ?? [], item, scene.walls, scene.visionRange * scene.gridSize);
  }
  return true;
}

/** La escena tal como la recibe cada rol: los jugadores no distinguen las puertas secretas. */
export function sceneFor(scene: Scene, role: CampaignRole): Scene {
  return role === 'gm' ? scene : { ...scene, walls: wallsForPlayer(scene.walls) };
}

/** Lo que se envía de un elemento: la IA de los enemigos solo la ve el DM. */
export function forViewer(item: BoardItem, role: CampaignRole): BoardItem {
  return role === 'gm' || !item.ai ? item : { ...item, ai: null };
}

/** Campos que un jugador puede cambiar en un token suyo. */
export const PLAYER_EDITABLE_FIELDS = new Set(['x', 'y', 'rotation', 'statuses']);
/** En sus propios dibujos, además, puede cambiar el tamaño y el trazo. */
export const PLAYER_DRAWING_FIELDS = new Set(['x', 'y', 'rotation', 'width', 'height', 'drawing']);
