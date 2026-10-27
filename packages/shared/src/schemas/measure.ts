import { z } from 'zod';
import type { Scene } from './board.js';
import { tr } from '../i18n/index.js';

/**
 * Mediciones y plantillas de área sobre el tablero. Son efímeras: no se guardan,
 * solo se retransmiten a quien esté mirando la escena.
 */
export const MEASURE_SHAPES = ['ruler', 'circle', 'cone', 'line', 'square'] as const;
export type MeasureShape = (typeof MEASURE_SHAPES)[number];

export const MEASURE_LABELS: Record<MeasureShape, string> = {
  ruler: tr('Regla'),
  circle: tr('Círculo'),
  cone: tr('Cono'),
  line: tr('Línea'),
  square: tr('Cubo'),
};

/** Reglas para contar las diagonales de la cuadrícula. */
export const DIAGONAL_RULES = ['5e', 'alt', 'euclid'] as const;
export type DiagonalRule = (typeof DIAGONAL_RULES)[number];
export const DIAGONAL_LABELS: Record<DiagonalRule, string> = {
  '5e': tr('Cada diagonal cuenta 1 casilla (5e)'),
  alt: tr('Diagonales alternas 1-2-1 (variante DMG)'),
  euclid: tr('Distancia real (sin cuadrícula)'),
};

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export type Point = z.infer<typeof pointSchema>;

/**
 * Puntos de giro (centros) de un token que se mueve dando un rodeo, entre el origen y el destino.
 * Así se puede doblar una esquina sin atravesar la pared: el servidor comprueba cada tramo.
 */
export const movePathSchema = z.array(pointSchema).max(30);

export const measureSchema = z.object({
  shape: z.enum(MEASURE_SHAPES),
  /** Regla: origen, puntos intermedios y final. Plantillas: origen y final. */
  points: z.array(pointSchema).min(2).max(32),
});
export type Measure = z.infer<typeof measureSchema>;

export const pingSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  /** Solo el DM: centra la vista de todos en el punto. */
  focus: z.boolean().default(false),
});
export type PingInput = z.input<typeof pingSchema>;

/** Ajustes de distancia de una escena. */
export type DistanceSettings = Pick<Scene, 'gridSize' | 'cellDistance' | 'distanceUnit' | 'diagonalRule'>;

/** Ángulo total de un cono de 5e (su anchura en cada punto es igual a su distancia al origen). */
export const CONE_ANGLE = 2 * Math.atan(0.5);

/**
 * Distancia en casillas de un tramo según la regla de diagonales.
 * `parity` lleva la cuenta de diagonales ya hechas (para la regla 1-2-1 entre tramos).
 */
function segmentCells(a: Point, b: Point, s: DistanceSettings, parity: number): { cells: number; parity: number } {
  const dx = Math.abs(b.x - a.x) / s.gridSize;
  const dy = Math.abs(b.y - a.y) / s.gridSize;
  if (s.diagonalRule === 'euclid') return { cells: Math.hypot(dx, dy), parity };
  const diag = Math.round(Math.min(dx, dy));
  const straight = Math.round(Math.max(dx, dy)) - diag;
  if (s.diagonalRule === '5e') return { cells: diag + straight, parity };
  // 1-2-1: cada segunda diagonal cuenta doble.
  const doubles = Math.floor((parity + diag) / 2);
  return { cells: straight + diag + doubles, parity: (parity + diag) % 2 };
}

/** Distancia en casillas a lo largo de una ruta de puntos. */
export function pathCells(points: Point[], s: DistanceSettings): number {
  let total = 0;
  let parity = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = segmentCells(points[i - 1]!, points[i]!, s, parity);
    total += seg.cells;
    parity = seg.parity;
  }
  return total;
}

/** Texto listo para mostrar, p. ej. "30 pies". */
export function formatDistance(cells: number, s: DistanceSettings): string {
  const value = Math.round(cells * s.cellDistance * 10) / 10;
  return `${value} ${s.distanceUnit}`.trim();
}

/** Distancia que se muestra para una medición (la regla suma tramos; las plantillas, su tamaño). */
export function measureCells(m: Measure, s: DistanceSettings): number {
  if (m.shape === 'ruler') return pathCells(m.points, s);
  const [a, b] = [m.points[0]!, m.points[m.points.length - 1]!];
  if (m.shape === 'square') return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / s.gridSize;
  // Radio, longitud del cono o de la línea: se mide en línea recta.
  return Math.hypot(b.x - a.x, b.y - a.y) / s.gridSize;
}

/** Cuadrado de una plantilla "cubo": esquina en el origen, crece hacia donde se arrastra. */
export function squareRect(m: Measure) {
  const [a, b] = [m.points[0]!, m.points[m.points.length - 1]!];
  const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return { x: b.x < a.x ? a.x - side : a.x, y: b.y < a.y ? a.y - side : a.y, w: side, h: side };
}

/** ¿Cae el punto p dentro de la plantilla de área? (anchura de la línea: 1 casilla). */
export function isInArea(m: Measure, p: Point, gridSize: number): boolean {
  const [a, b] = [m.points[0]!, m.points[m.points.length - 1]!];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  const dist = Math.hypot(dx, dy);
  switch (m.shape) {
    case 'circle':
      return dist <= len;
    case 'square': {
      const r = squareRect(m);
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    }
    case 'cone': {
      if (len === 0 || dist > len) return false;
      if (dist === 0) return true;
      const cos = (dx * (b.x - a.x) + dy * (b.y - a.y)) / (dist * len);
      return Math.acos(Math.max(-1, Math.min(1, cos))) <= CONE_ANGLE / 2 + 1e-9;
    }
    case 'line': {
      if (len === 0) return false;
      const along = (dx * (b.x - a.x) + dy * (b.y - a.y)) / len;
      const across = Math.abs(dx * (b.y - a.y) - dy * (b.x - a.x)) / len;
      return along >= 0 && along <= len && across <= gridSize / 2;
    }
    default:
      return false;
  }
}

/** Casillas (columna, fila) cuyo centro queda dentro de la plantilla de área. */
export function cellsInArea(m: Measure, scene: Pick<Scene, 'gridSize' | 'widthCells' | 'heightCells'>): { col: number; row: number }[] {
  if (m.shape === 'ruler') return [];
  const g = scene.gridSize;
  const xs = m.points.map((p) => p.x);
  const ys = m.points.map((p) => p.y);
  const reach = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + g;
  const a = m.points[0]!;
  const minCol = Math.max(0, Math.floor((a.x - reach) / g));
  const maxCol = Math.min(scene.widthCells - 1, Math.floor((a.x + reach) / g));
  const minRow = Math.max(0, Math.floor((a.y - reach) / g));
  const maxRow = Math.min(scene.heightCells - 1, Math.floor((a.y + reach) / g));
  const cells: { col: number; row: number }[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      if (isInArea(m, { x: (col + 0.5) * g, y: (row + 0.5) * g }, g)) cells.push({ col, row });
    }
  }
  return cells;
}

/**
 * Tokens alcanzados por una plantilla: los que tienen dentro el centro de alguna de sus casillas
 * (o su centro, si son más pequeños que una casilla).
 */
export function itemsInArea<T extends { x: number; y: number; width: number; height: number }>(m: Measure, items: T[], gridSize: number): T[] {
  if (m.shape === 'ruler') return [];
  return items.filter((it) => {
    const cols = Math.max(1, Math.round(it.width / gridSize));
    const rows = Math.max(1, Math.round(it.height / gridSize));
    const cw = it.width / cols;
    const ch = it.height / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) if (isInArea(m, { x: it.x + (c + 0.5) * cw, y: it.y + (r + 0.5) * ch }, gridSize)) return true;
    return false;
  });
}

/** Color estable para cada usuario (reglas y pings). */
export function userColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 75%, 60%)`;
}
