import { eyeOf, isPointRevealed, lightsOf, seesRect, wallsForPlayer, type BoardItem, type CampaignRole, type Eye, type LightSource, type Scene } from '@vtt/shared';

/** ¿Es un token que "mira" (cuenta para la visión dinámica)? */
export const isEye = (item: BoardItem) => item.layer === 'token' && !item.drawing;

/** Desde dónde ve un jugador con la visión dinámica: el centro de cada token suyo (con su visión en la oscuridad). */
export function eyesOf(items: BoardItem[], userId: string, scene: Scene): Eye[] {
  return items.filter((i) => isEye(i) && i.ownerIds.includes(userId)).map((i) => eyeOf(i, scene));
}

/** Lo que hace falta para decidir qué ve un jugador: sus ojos y, si la escena está a oscuras, las luces. */
export interface Sight {
  eyes: Eye[];
  lights: LightSource[] | null;
}

/** La vista de un jugador en una escena con visión dinámica (undefined si no se aplica). */
export function sightOf(items: BoardItem[], scene: Scene, role: CampaignRole, userId: string): Sight | undefined {
  if (!scene.vision || role === 'gm') return undefined;
  return { eyes: eyesOf(items, userId, scene), lights: scene.lighting ? lightsOf(items, scene) : null };
}

/**
 * Decide si un usuario puede ver un elemento del tablero. Se aplica SIEMPRE en el
 * servidor: a los jugadores ni siquiera les llegan los datos de lo que no deben ver.
 * Con la visión dinámica activada hace falta `sight` (sus tokens y las luces): sin ella no ve nada ajeno.
 */
export function canSeeItem(item: BoardItem, scene: Scene, role: CampaignRole, userId: string, sight?: Sight): boolean {
  if (role === 'gm') return true;
  if (item.layer === 'gm') return false;
  if (item.layer === 'token' && !item.ownerIds.includes(userId)) {
    if (!isPointRevealed(scene.fog, item.x + item.width / 2, item.y + item.height / 2)) return false;
    if (scene.vision) return seesRect(sight?.eyes ?? [], item, scene.walls, scene.visionRange * scene.gridSize, sight?.lights ?? null);
  }
  return true;
}

/** La escena tal como la recibe cada rol: los jugadores no distinguen las puertas secretas. */
export function sceneFor(scene: Scene, role: CampaignRole): Scene {
  return role === 'gm' ? scene : { ...scene, walls: wallsForPlayer(scene.walls) };
}

/** Lo que se envía de un elemento: la IA de los enemigos y las notas privadas solo las ve el DM. */
export function forViewer(item: BoardItem, role: CampaignRole): BoardItem {
  return role === 'gm' || (!item.ai && !item.gmNotes) ? item : { ...item, ai: null, gmNotes: '' };
}

/** Campos que un jugador puede cambiar en un token suyo. */
export const PLAYER_EDITABLE_FIELDS = new Set(['x', 'y', 'rotation', 'statuses', 'statusRounds', 'light']);
/** En sus propios dibujos, además, puede cambiar el tamaño y el trazo. */
export const PLAYER_DRAWING_FIELDS = new Set(['x', 'y', 'rotation', 'width', 'height', 'drawing']);
