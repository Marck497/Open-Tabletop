import type { BoardItem, CreateItemInput, Point, UpdateItemInput, Wall } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { useBoard } from './store';
import { tr } from '../../core/i18n';

/**
 * Deshacer y rehacer (Ctrl+Z / Ctrl+Y) lo que hace cada uno en el tablero: crear, mover, editar
 * y borrar elementos, y cambiar las paredes. El historial es de este navegador y de la escena
 * abierta; deshacer manda al servidor la operación contraria, que comprueba los permisos como siempre.
 */
interface Step {
  sceneId: string;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
  /** Para juntar cambios seguidos del mismo campo (p. ej. teclear un número). */
  mergeKey?: string;
  at: number;
}

const MAX_STEPS = 100;
const MERGE_MS = 1200;
let undoStack: Step[] = [];
let redoStack: Step[] = [];
/** Al deshacer un borrado el elemento vuelve con otro id: los pasos anteriores lo siguen por aquí. */
const alias = new Map<string, string>();
const idOf = (id: string): string => {
  let cur = id;
  for (let n = 0; n < 50 && alias.has(cur); n++) cur = alias.get(cur)!;
  return cur;
};

function push(step: Omit<Step, 'at'>) {
  const now = Date.now();
  const last = undoStack[undoStack.length - 1];
  if (step.mergeKey && last?.mergeKey === step.mergeKey && now - last.at < MERGE_MS) {
    // Mismo campo otra vez: se queda el «deshacer» del primero y el «rehacer» del último.
    undoStack[undoStack.length - 1] = { ...last, redo: step.redo, at: now };
  } else undoStack = [...undoStack, { ...step, at: now }].slice(-MAX_STEPS);
  redoStack = [];
}

/** Lo que hace falta para volver a crear un elemento borrado. */
function createInputOf({ id: _id, sceneId: _s, stats: _st, ...rest }: BoardItem): CreateItemInput {
  return rest;
}

/** Crea un elemento y lo apunta en el historial. */
export async function createItem(sceneId: string, input: CreateItemInput): Promise<BoardItem> {
  const item = await emitAck('item:create', { sceneId, item: input });
  let current = item.id;
  push({
    sceneId,
    undo: () => emitAck('item:delete', { sceneId, id: idOf(current) }),
    redo: async () => {
      const again = await emitAck('item:create', { sceneId, item: input });
      alias.set(idOf(current), again.id);
      current = again.id;
    },
  });
  return item;
}

/** Cambia un elemento y apunta en el historial cómo estaba (solo los campos que cambian). */
/** `path`: puntos de giro de un movimiento con rodeo (deshacerlo vuelve por el mismo camino). */
export async function updateItem(sceneId: string, id: string, patch: UpdateItemInput, path?: Point[]): Promise<BoardItem> {
  const before = useBoard.getState().items[id];
  const result = await emitAck('item:update', { sceneId, id, patch, ...(path?.length ? { path } : {}) });
  if (before) {
    const back = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof BoardItem] ?? null])) as UpdateItemInput;
    push({
      sceneId,
      undo: () => emitAck('item:update', { sceneId, id: idOf(id), patch: back, ...(path?.length ? { path: [...path].reverse() } : {}) }),
      redo: () => emitAck('item:update', { sceneId, id: idOf(id), patch, ...(path?.length ? { path } : {}) }),
      mergeKey: `${id}:${Object.keys(patch).sort().join(',')}`,
    });
  }
  return result;
}

/** Borra un elemento; deshacerlo lo vuelve a crear tal cual (con otro id). */
export async function deleteItem(sceneId: string, id: string): Promise<void> {
  const before = useBoard.getState().items[id];
  await emitAck('item:delete', { sceneId, id });
  if (!before) return;
  const input = createInputOf(before);
  push({
    sceneId,
    undo: async () => {
      const again = await emitAck('item:create', { sceneId, item: input });
      alias.set(idOf(id), again.id);
    },
    redo: () => emitAck('item:delete', { sceneId, id: idOf(id) }),
  });
}

/** Apunta un cambio de paredes (las guarda quien llama). */
export function recordWalls(sceneId: string, before: Wall[], after: Wall[]) {
  const set = (walls: Wall[]) => {
    useBoard.getState().setWalls(walls);
    return emitAck('walls:set', { sceneId, walls });
  };
  push({ sceneId, undo: () => set(before), redo: () => set(after) });
}

let busy = false;

async function run(from: 'undo' | 'redo') {
  const sceneId = useBoard.getState().scene?.id;
  const stack = from === 'undo' ? undoStack : redoStack;
  const step = stack[stack.length - 1];
  if (busy || !step || step.sceneId !== sceneId) return;
  busy = true;
  stack.pop();
  try {
    await step[from]();
    (from === 'undo' ? redoStack : undoStack).push({ ...step, mergeKey: undefined });
    useBoard.getState().showNotice(from === 'undo' ? tr('↶ Deshecho') : tr('↷ Rehecho'));
  } catch (e) {
    useBoard.getState().showNotice(tr('No se puede {0}: {message}', { '0': from === 'undo' ? tr('deshacer') : tr('rehacer'), message: (e as Error).message }));
  } finally {
    busy = false;
  }
}

export const undo = () => run('undo');
export const redo = () => run('redo');

/** Al cambiar de escena se empieza de cero. */
export function resetHistory(sceneId: string | null) {
  undoStack = undoStack.filter((s) => s.sceneId === sceneId);
  redoStack = redoStack.filter((s) => s.sceneId === sceneId);
}
