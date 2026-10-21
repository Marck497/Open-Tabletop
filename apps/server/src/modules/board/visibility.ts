import { isPointRevealed, type BoardItem, type CampaignRole, type Scene } from '@vtt/shared';

/**
 * Decide si un usuario puede ver un elemento del tablero. Se aplica SIEMPRE en el
 * servidor: a los jugadores ni siquiera les llegan los datos de lo que no deben ver.
 */
export function canSeeItem(item: BoardItem, scene: Scene, role: CampaignRole, userId: string): boolean {
  if (role === 'gm') return true;
  if (item.layer === 'gm') return false;
  if (item.layer === 'token' && !item.ownerIds.includes(userId)) {
    return isPointRevealed(scene.fog, item.x + item.width / 2, item.y + item.height / 2);
  }
  return true;
}

/** Lo que se envía de un elemento: la IA de los enemigos solo la ve el DM. */
export function forViewer(item: BoardItem, role: CampaignRole): BoardItem {
  return role === 'gm' || !item.ai ? item : { ...item, ai: null };
}

/** Campos que un jugador puede cambiar en un token suyo. */
export const PLAYER_EDITABLE_FIELDS = new Set(['x', 'y', 'rotation', 'statuses']);
/** En sus propios dibujos, además, puede cambiar el tamaño y el trazo. */
export const PLAYER_DRAWING_FIELDS = new Set(['x', 'y', 'rotation', 'width', 'height', 'drawing']);
