import { homebrewRows, itemsInArea, type Character, type ChatEffect, type HomebrewEntry, type SheetRow, type SheetTemplate } from '@vtt/shared';
import { api } from '../../core/api';
import { emitAck } from '../../core/socket';
import { useBoard } from '../board/store';
import { currentFxTarget } from '../fx/target';
import { newRowId } from '../sheets/SheetField';
import { useSheets } from '../sheets/store';

/** Añade la creación a la hoja: filas enlazadas en conjuros, ataques, inventario y recursos. Devuelve las tablas tocadas. */
export async function addToSheet(c: Character, template: SheetTemplate, entry: HomebrewEntry): Promise<string[]> {
  const rows = homebrewRows(template, entry, c.values);
  if (!rows.length) throw new Error('La plantilla de hoja no tiene tablas donde ponerla');
  const values: Character['values'] = {};
  for (const { list, row } of rows) {
    const current = (values[list] as SheetRow[] | undefined) ?? (Array.isArray(c.values[list]) ? (c.values[list] as SheetRow[]) : []);
    values[list] = [...current, { ...row, _id: newRowId() }];
  }
  const { character } = await api.patch<{ character: Character }>(`/characters/${c.id}`, { values });
  useSheets.getState().upsert(character);
  return rows.map((r) => r.list);
}

/** Usa la creación con una hoja (el servidor tira, gasta y lo cuenta en el chat). */
export function runEntry(characterId: string, entryId: string, slot?: number) {
  return emitAck('sheet:action', { characterId, action: { kind: 'homebrew', entryId, slot }, fx: currentFxTarget() });
}

/** Activa la plantilla de área con el tamaño del efecto: el siguiente clic en el tablero la coloca. */
export function placeTemplate(effect: Pick<ChatEffect, 'area' | 'name'>) {
  const { scene, startTemplate, showNotice } = useBoard.getState();
  if (!effect.area) return;
  if (!scene) {
    alert('Abre una escena para colocar la plantilla.');
    return;
  }
  const cells = effect.area.size / (scene.cellDistance || 5);
  startTemplate({ shape: effect.area.shape, cells, label: effect.name });
  showNotice(`${effect.name}: haz clic donde empieza el área y arrastra para orientarla`);
}

/** Tokens a los que se aplica: los de mi plantilla de área si hay una puesta; si no, el seleccionado. */
export function currentTargets() {
  const { scene, items, myMeasure, selectedId } = useBoard.getState();
  if (!scene) return [];
  const tokens = Object.values(items).filter((i) => !i.drawing && i.layer !== 'map');
  if (myMeasure && myMeasure.shape !== 'ruler') return itemsInArea(myMeasure, tokens, scene.gridSize);
  const sel = selectedId ? items[selectedId] : undefined;
  return sel && !sel.drawing ? [sel] : [];
}

/** DM: aplica el efecto de un mensaje del chat a los tokens elegidos. */
export async function applyEffect(messageId: string, name: string) {
  const targets = currentTargets();
  if (!targets.length) {
    alert('Selecciona un token o coloca la plantilla de área encima de los objetivos.');
    return;
  }
  const names = targets.map((t) => t.name || useSheets.getState().characters[t.characterId ?? '']?.name || 'token');
  if (!confirm(`¿Aplicar ${name} a ${names.join(', ')}?`)) return;
  await emitAck('effect:apply', { messageId, itemIds: targets.map((t) => t.id) }).catch((e: Error) => alert(e.message));
}
