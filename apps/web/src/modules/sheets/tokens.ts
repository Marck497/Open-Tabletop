import type { Character, TokenAi } from '@vtt/shared';
import { addItem } from '../board/actions';
import { useBoard } from '../board/store';

/**
 * Crea en la escena actual un token vinculado al personaje (lo mueven quienes lo controlan).
 * `cells` es su tamaño en casillas y `ai`, la IA con la que empieza (monstruos del compendio).
 */
export function addCharacterToken(character: Character, opts: { cells?: number; ai?: TokenAi } = {}) {
  const size = (useBoard.getState().scene?.gridSize ?? 70) * (opts.cells ?? 1);
  return addItem({
    layer: 'token',
    width: size,
    height: size,
    name: character.name,
    showName: true,
    assetId: character.avatarAssetId,
    characterId: character.id,
    ownerIds: character.controlledBy,
    ...(opts.ai ? { ai: opts.ai } : {}),
  });
}
