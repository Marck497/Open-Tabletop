import { macroLines, type Macro } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { useBoard } from '../board/store';
import { useSheets } from '../sheets/store';

/**
 * Personaje con el que se lanza una macro: el suyo si lo tiene; si no, el del token
 * seleccionado (si lo controlas); si no, ninguno (tiras como tú).
 */
export function macroCharacter(macro: Macro, meId: string, isGm: boolean): string | null {
  if (macro.characterId) return macro.characterId;
  const { selectedId, items } = useBoard.getState();
  const characterId = selectedId ? items[selectedId]?.characterId : null;
  const character = characterId ? useSheets.getState().characters[characterId] : undefined;
  return character && (isGm || character.controlledBy.includes(meId)) ? character.id : null;
}

/** Envía cada línea de la macro al chat, en orden. */
export async function runMacro(campaignId: string, macro: Macro, meId: string, isGm: boolean) {
  const asCharacterId = macroCharacter(macro, meId, isGm);
  for (const text of macroLines(macro.command)) await emitAck('chat:send', { campaignId, text, asCharacterId });
}
