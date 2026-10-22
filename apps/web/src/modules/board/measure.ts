import type { Measure, Point } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { useBoard } from './store';

const SHARE_THROTTLE_MS = 60;
let lastShare = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

/** ¿Es secreta mi medición? El DM que trabaja en su capa mide sin que lo vean los jugadores. */
function gmOnly(isGm: boolean) {
  return isGm && useBoard.getState().activeLayer === 'gm';
}

/** Actualiza mi medición y la comparte (con un límite de envíos por segundo). */
export function setMeasure(measure: Measure | null, isGm: boolean, { now = false } = {}) {
  const { scene, setMyMeasure } = useBoard.getState();
  setMyMeasure(measure);
  if (!scene) return;
  const send = () => {
    pending = null;
    lastShare = performance.now();
    getSocket().emit('board:measure', { sceneId: scene.id, measure: useBoard.getState().myMeasure, gmOnly: gmOnly(isGm) });
  };
  if (pending) clearTimeout(pending);
  const wait = SHARE_THROTTLE_MS - (performance.now() - lastShare);
  if (now || wait <= 0) send();
  else pending = setTimeout(send, wait);
}

export function clearMeasure(isGm: boolean) {
  if (useBoard.getState().myMeasure) setMeasure(null, isGm, { now: true });
}

export function sendPing(p: Point, focus: boolean) {
  const { scene, addPing } = useBoard.getState();
  if (!scene) return;
  getSocket().emit('board:ping', { sceneId: scene.id, x: p.x, y: p.y, focus });
  addPing({ userId: 'yo', name: '', color: '#d6a84a', x: p.x, y: p.y });
}

/**
 * Ajuste a la cuadrícula: la regla va de centro a centro de casilla;
 * las plantillas, a centros o esquinas (media casilla). Con Alt, libre.
 */
export function snapPoint(p: Point, gridSize: number, mode: 'center' | 'half' | 'free'): Point {
  if (mode === 'free') return p;
  if (mode === 'center') return { x: (Math.floor(p.x / gridSize) + 0.5) * gridSize, y: (Math.floor(p.y / gridSize) + 0.5) * gridSize };
  const h = gridSize / 2;
  return { x: Math.round(p.x / h) * h, y: Math.round(p.y / h) * h };
}

/** Las plantillas miden casillas enteras (salvo con Alt): se ajusta el final manteniendo la dirección. */
export function snapTemplateEnd(origin: Point, raw: Point, gridSize: number, shape: Measure['shape']): Point {
  const dx = raw.x - origin.x;
  const dy = raw.y - origin.y;
  if (shape === 'square') {
    const side = Math.max(gridSize, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / gridSize) * gridSize);
    return { x: origin.x + Math.sign(dx || 1) * side, y: origin.y + Math.sign(dy || 1) * side };
  }
  const len = Math.hypot(dx, dy);
  if (len === 0) return raw;
  const snapped = Math.round(len / gridSize) * gridSize;
  return { x: origin.x + (dx / len) * snapped, y: origin.y + (dy / len) * snapped };
}

/**
 * Final de una plantilla de tamaño fijo: misma dirección que el puntero, con el largo justo
 * (el cubo crece hacia la esquina en la que está el puntero).
 */
export function fixedTemplateEnd(origin: Point, raw: Point, length: number, shape: Measure['shape']): Point {
  const dx = raw.x - origin.x;
  const dy = raw.y - origin.y;
  if (shape === 'square') return { x: origin.x + (dx < 0 ? -length : length), y: origin.y + (dy < 0 ? -length : length) };
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: origin.x + length, y: origin.y };
  return { x: origin.x + (dx / len) * length, y: origin.y + (dy / len) * length };
}
