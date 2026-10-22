import type { Point } from './measure.js';
import { visibilityPolygon, type Wall } from './walls.js';
import type { Eye, LightSource } from './lights.js';

/**
 * Zonas ya exploradas con la visión dinámica: un mapa de bits sobre la escena, con varias
 * subcasillas por casilla (menos cuanto más grande es la escena). Se guarda en base64.
 * Solo dice por dónde han pasado los tokens: no revela tokens, que se filtran aparte.
 */
export interface ExploredGrid {
  cols: number;
  rows: number;
  /** Lado de una subcasilla en píxeles de escena. */
  size: number;
}

/** Máximo de subcasillas por lado (200 casillas × 2). */
const MAX_SIDE = 400;

export function exploredGrid(scene: { widthCells: number; heightCells: number; gridSize: number }): ExploredGrid {
  const per = Math.max(1, Math.min(4, Math.floor(MAX_SIDE / Math.max(scene.widthCells, scene.heightCells))));
  return { cols: scene.widthCells * per, rows: scene.heightCells * per, size: scene.gridSize / per };
}

const byteLength = (g: ExploredGrid) => Math.ceil((g.cols * g.rows) / 8);

/** Decodifica lo guardado; si no encaja con la escena (o está vacío), empieza en blanco. */
export function decodeExplored(text: string, g: ExploredGrid): Uint8Array {
  const out = new Uint8Array(byteLength(g));
  if (!text) return out;
  try {
    const bin = atob(text);
    if (bin.length !== out.length) return out;
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  } catch {
    // Texto dañado: se trata como sin explorar.
  }
  return out;
}

export function encodeExplored(bits: Uint8Array): string {
  if (bits.every((b) => b === 0)) return '';
  let bin = '';
  for (let i = 0; i < bits.length; i++) bin += String.fromCharCode(bits[i]!);
  return btoa(bin);
}

export const isExplored = (bits: Uint8Array, g: ExploredGrid, col: number, row: number) => {
  const i = row * g.cols + col;
  return ((bits[i >> 3] ?? 0) >> (i & 7)) & 1;
};

/**
 * Marca las subcasillas cuyo centro cae dentro del polígono (relleno por líneas).
 * Devuelve si ha marcado alguna nueva.
 */
export function markPolygon(bits: Uint8Array, g: ExploredGrid, poly: Point[], allow?: (i: number) => boolean): boolean {
  if (poly.length < 3) return false;
  let changed = false;
  const xs: number[] = [];
  for (let r = 0; r < g.rows; r++) {
    const y = (r + 0.5) * g.size;
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!;
      const b = poly[j]!;
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k]! / g.size - 0.5));
      const c1 = Math.min(g.cols - 1, Math.floor(xs[k + 1]! / g.size - 0.5));
      for (let c = c0; c <= c1; c++) {
        const i = r * g.cols + c;
        const mask = 1 << (i & 7);
        if (!(bits[i >> 3]! & mask) && (!allow || allow(i))) {
          bits[i >> 3]! |= mask;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Añade a lo explorado lo que ven ahora `eyes`. Con `lights` (escena a oscuras), solo cuenta
 * lo iluminado o lo que cae dentro de la visión en la oscuridad. Devuelve el texto nuevo, o null si no cambia nada.
 */
export function exploreFrom(
  scene: { widthCells: number; heightCells: number; gridSize: number; visionRange: number; walls: Wall[] },
  explored: string,
  eyes: Eye[],
  lights: LightSource[] | null = null,
): string | null {
  if (!eyes.length) return null;
  const g = exploredGrid(scene);
  const bits = decodeExplored(explored, g);
  const w = scene.widthCells * scene.gridSize;
  const h = scene.heightCells * scene.gridSize;
  const range = scene.visionRange * scene.gridSize;
  // Escena a oscuras: primero se marca por dónde llega la luz.
  let lit: Uint8Array | null = null;
  if (lights) {
    lit = new Uint8Array(bits.length);
    for (const l of lights) markPolygon(lit, g, visibilityPolygon(l, scene.walls, w, h, l.radius));
  }
  const isLitCell = (i: number) => !!lit && ((lit[i >> 3]! >> (i & 7)) & 1) === 1;
  let changed = false;
  for (const e of eyes) {
    if (e.x < 0 || e.y < 0 || e.x > w || e.y > h) continue;
    if (lit) {
      const dv = range ? Math.min(range, e.darkvision ?? 0) : (e.darkvision ?? 0);
      if (dv > 0 && markPolygon(bits, g, visibilityPolygon(e, scene.walls, w, h, dv))) changed = true;
      if (markPolygon(bits, g, visibilityPolygon(e, scene.walls, w, h, range), isLitCell)) changed = true;
    } else if (markPolygon(bits, g, visibilityPolygon(e, scene.walls, w, h, range))) changed = true;
  }
  return changed ? encodeExplored(bits) : null;
}
