import type { BoardItem } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { addItem } from '../board/actions';
import { updateItem } from '../board/history';
import { useBoard } from '../board/store';
import { tr } from '../../core/i18n';

/**
 * Notas numeradas del DM sobre el mapa (1, 2, 3… como en los módulos de aventura): un círculo con su
 * número en la capa del DM, con título (el nombre) y texto (las notas del DM). Los jugadores no las reciben.
 */

export const isNote = (i: BoardItem) => i.drawing?.type === 'note';
export const noteNumber = (i: BoardItem) => Number(i.drawing?.text) || 0;

/** Notas de la escena abierta, por número. */
export function notesOf(items: Record<string, BoardItem>): BoardItem[] {
  return Object.values(items)
    .filter(isNote)
    .sort((a, b) => noteNumber(a) - noteNumber(b) || a.y - b.y || a.x - b.x);
}

/** Pone la nota siguiente en el centro de la vista (capa del DM) y la selecciona para escribirla. */
export function addNote() {
  const { scene, items } = useBoard.getState();
  if (!scene) return;
  const n = Math.max(0, ...notesOf(items).map(noteNumber)) + 1;
  const size = Math.round(scene.gridSize * 0.8);
  // En la capa del DM, para poder arrastrarla nada más ponerla.
  useBoard.getState().setActiveLayer('gm');
  return addItem({ layer: 'gm', width: size, height: size, name: tr('Nota {n}', { n }), drawing: { type: 'note', text: String(n) } });
}

/** Vuelve a numerar las notas 1, 2, 3… sin huecos (en el orden actual). */
export async function renumberNotes() {
  const { scene, items } = useBoard.getState();
  if (!scene) return;
  const list = notesOf(items);
  for (let k = 0; k < list.length; k++) {
    const note = list[k]!;
    const text = String(k + 1);
    if (note.drawing!.text === text) continue;
    const rename = note.name === `Nota ${note.drawing!.text}` ? { name: tr('Nota {text}', { text }) } : {};
    await updateItem(scene.id, note.id, { drawing: { ...note.drawing!, text }, ...rename });
  }
}

/** Centra la vista en la nota y la selecciona. */
export function goToNote(note: BoardItem) {
  useBoard.setState({ focus: { x: note.x + note.width / 2, y: note.y + note.height / 2, n: Date.now() } });
  useBoard.getState().select(note.id);
}

/** Lo que se lee a los jugadores: el texto hasta una línea con «---» (lo de después es solo para el DM). */
export const readablePart = (note: BoardItem) => note.gmNotes.split(/^\s*-{3,}\s*$/m)[0]!.trim();

/** Manda al chat, para todos, el título y la parte para leer de la nota (preguntando antes, por si acaso). */
export function readNote(campaignId: string, note: BoardItem) {
  const title = note.name.trim();
  const text = [title && `📜 ${title}`, readablePart(note)].filter(Boolean).join('\n');
  if (!text || !confirm(tr('¿Leer esto a todos en el chat?\n\n{text}', { text }))) return;
  return emitAck('chat:send', { campaignId, text }).catch((e: Error) => useBoard.getState().showNotice(e.message));
}
