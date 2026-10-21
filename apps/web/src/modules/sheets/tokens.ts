import type { Character } from '@vtt/shared';
import { addItem } from '../board/actions';
import { useBoard } from '../board/store';

/** Crea en la escena actual un token vinculado al personaje (lo mueven quienes lo controlan). */
export function addCharacterToken(character: Character) {
  const size = useBoard.getState().scene?.gridSize ?? 70;
  return addItem({
    layer: 'token',
    width: size,
    height: size,
    name: character.name,
    showName: true,
    assetId: character.avatarAssetId,
    characterId: character.id,
    ownerIds: character.controlledBy,
  });
}
