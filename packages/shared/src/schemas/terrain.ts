import { z } from 'zod';
import type { Wall } from './walls.js';

/**
 * Suelo del mapa pintado por casillas. Se guarda como un texto con un carácter por casilla
 * (fila a fila): '.' es vacío y el resto, el código de un terreno de la lista.
 * Los terrenos "sólidos" (roca, muro) y el vacío hacen de pared al generar las paredes solas.
 */
export const TERRAIN_EMPTY = '.';

export const TERRAIN_GROUPS = ['Interior', 'Exterior', 'Agua y peligros', 'Muros'] as const;
export type TerrainGroup = (typeof TERRAIN_GROUPS)[number];

export interface TerrainDef {
  /** Código de un carácter. */
  id: string;
  name: string;
  /** Color base (también para la vista previa). */
  color: string;
  group: TerrainGroup;
  /** Bloquea: cuenta como pared para las paredes automáticas. */
  solid?: boolean;
}

export const TERRAINS: TerrainDef[] = [
  { id: 'p', name: 'Losas de piedra', color: '#7d7a76', group: 'Interior' },
  { id: 'c', name: 'Adoquines', color: '#6f6a64', group: 'Interior' },
  { id: 'w', name: 'Madera', color: '#8a5a33', group: 'Interior' },
  { id: 'b', name: 'Baldosas', color: '#b9b2a3', group: 'Interior' },
  { id: 'm', name: 'Mármol', color: '#d9d6cf', group: 'Interior' },
  { id: 'k', name: 'Alfombra', color: '#8e2b2b', group: 'Interior' },
  { id: 'o', name: 'Suelo de cueva', color: '#5d544b', group: 'Interior' },
  { id: 'g', name: 'Hierba', color: '#4f7a35', group: 'Exterior' },
  { id: 'd', name: 'Tierra', color: '#7a5b3a', group: 'Exterior' },
  { id: 's', name: 'Arena', color: '#cdb27a', group: 'Exterior' },
  { id: 'n', name: 'Nieve', color: '#e6edf2', group: 'Exterior' },
  { id: 'f', name: 'Bosque', color: '#2f5426', group: 'Exterior' },
  { id: 'a', name: 'Agua', color: '#3d78a8', group: 'Agua y peligros' },
  { id: 'A', name: 'Agua profunda', color: '#1f4a75', group: 'Agua y peligros' },
  { id: 'v', name: 'Pantano', color: '#4c5a34', group: 'Agua y peligros' },
  { id: 'h', name: 'Hielo', color: '#a9d3e6', group: 'Agua y peligros' },
  { id: 'l', name: 'Lava', color: '#d4541c', group: 'Agua y peligros' },
  { id: 'x', name: 'Abismo', color: '#0d0c10', group: 'Agua y peligros' },
  { id: 'r', name: 'Roca', color: '#3b3836', group: 'Muros', solid: true },
  { id: 'B', name: 'Muro de ladrillo', color: '#6b4a3a', group: 'Muros', solid: true },
];

const BY_ID = new Map(TERRAINS.map((t) => [t.id, t]));
export const terrainById = (id: string) => BY_ID.get(id);

/** Máximo de casillas de una escena (200 × 200). */
export const MAX_TERRAIN_CELLS = 200 * 200;

const CODES = TERRAINS.map((t) => t.id).join('');
export const terrainSchema = z
  .string()
  .max(MAX_TERRAIN_CELLS)
  .regex(new RegExp(`^[.${CODES}]*$`), 'Terreno desconocido');

/** ¿Hace de pared? (vacío o sólido) */
export const isSolidCell = (code: string | undefined) => !code || code === TERRAIN_EMPTY || !!BY_ID.get(code)?.solid;

export const emptyTerrain = (w: number, h: number) => TERRAIN_EMPTY.repeat(w * h);

/** Terreno con el tamaño correcto (un texto vacío o de otro tamaño cuenta como todo vacío). */
export const normalizeTerrain = (terrain: string, w: number, h: number) => (terrain.length === w * h ? terrain : emptyTerrain(w, h));

/** Ajusta el terreno a un tamaño nuevo de escena conservando la esquina superior izquierda. */
export function resizeTerrain(terrain: string, oldW: number, oldH: number, newW: number, newH: number): string {
  if (!terrain || terrain.length !== oldW * oldH) return '';
  let out = '';
  for (let y = 0; y < newH; y++) {
    if (y < oldH) {
      const row = terrain.slice(y * oldW, y * oldW + Math.min(oldW, newW));
      out += row + TERRAIN_EMPTY.repeat(newW - row.length);
    } else out += TERRAIN_EMPTY.repeat(newW);
  }
  return /[^.]/.test(out) ? out : '';
}

// ---------- Pintar ----------

/** Rellena un rectángulo de casillas (extremos incluidos, en cualquier orden). */
export function paintRect(terrain: string, w: number, h: number, x0: number, y0: number, x1: number, y1: number, code: string): string {
  const cells = normalizeTerrain(terrain, w, h).split('');
  const [ax, bx] = [Math.max(0, Math.min(x0, x1)), Math.min(w - 1, Math.max(x0, x1))];
  const [ay, by] = [Math.max(0, Math.min(y0, y1)), Math.min(h - 1, Math.max(y0, y1))];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) cells[y * w + x] = code;
  return cells.join('');
}

/** Pincel cuadrado de `size` casillas centrado en (x, y). */
export function paintBrush(terrain: string, w: number, h: number, x: number, y: number, size: number, code: string): string {
  const r0 = Math.floor((size - 1) / 2);
  return paintRect(terrain, w, h, x - r0, y - r0, x - r0 + size - 1, y - r0 + size - 1, code);
}

/** Cubo de pintura: cambia la zona contigua (4 vecinos) del mismo terreno que (x, y). */
export function floodFill(terrain: string, w: number, h: number, x: number, y: number, code: string): string {
  const cells = normalizeTerrain(terrain, w, h).split('');
  if (x < 0 || y < 0 || x >= w || y >= h) return cells.join('');
  const from = cells[y * w + x]!;
  if (from === code) return cells.join('');
  const stack = [y * w + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (cells[i] !== from) continue;
    cells[i] = code;
    const cx = i % w;
    if (cx > 0) stack.push(i - 1);
    if (cx < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  return cells.join('');
}

// ---------- Paredes automáticas ----------

/** Lado de una casilla: horizontal (encima de la fila y) o vertical (a la izquierda de la columna x). */
interface Edge {
  dir: 'h' | 'v';
  x: number;
  y: number;
}

/** ¿Tapa ya ese lado una pared puesta a mano (p. ej. una puerta)? */
function coveredBy(edge: Edge, g: number, walls: Wall[]) {
  const mx = edge.dir === 'h' ? (edge.x + 0.5) * g : edge.x * g;
  const my = edge.dir === 'h' ? edge.y * g : (edge.y + 0.5) * g;
  const tol = g * 0.05;
  return walls.some((w) => {
    if (edge.dir === 'h' && Math.abs(w.y1 - w.y2) < tol && Math.abs(w.y1 - my) < tol) return mx > Math.min(w.x1, w.x2) - tol && mx < Math.max(w.x1, w.x2) + tol;
    if (edge.dir === 'v' && Math.abs(w.x1 - w.x2) < tol && Math.abs(w.x1 - mx) < tol) return my > Math.min(w.y1, w.y2) - tol && my < Math.max(w.y1, w.y2) + tol;
    return false;
  });
}

/**
 * Paredes donde el suelo toca el vacío o un terreno sólido (los bordes de la escena no cuentan).
 * Los tramos seguidos se unen en una sola pared y se saltan los lados que ya tapa `manual`.
 */
export function wallsFromTerrain(terrain: string, w: number, h: number, g: number, manual: Wall[] = []): Wall[] {
  if (terrain.length !== w * h) return [];
  const solid = (x: number, y: number) => isSolidCell(terrain[y * w + x]);
  const out: Wall[] = [];
  const push = (x1: number, y1: number, x2: number, y2: number) =>
    out.push({ id: `auto${out.length.toString(36)}`, x1: x1 * g, y1: y1 * g, x2: x2 * g, y2: y2 * g, kind: 'wall', open: false, locked: false, auto: true });

  // Lados horizontales: entre la fila y-1 y la y.
  for (let y = 1; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const wall = x < w && solid(x, y - 1) !== solid(x, y) && !coveredBy({ dir: 'h', x, y }, g, manual);
      if (wall && start < 0) start = x;
      if (!wall && start >= 0) {
        push(start, y, x, y);
        start = -1;
      }
    }
  }
  // Lados verticales: entre la columna x-1 y la x.
  for (let x = 1; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const wall = y < h && solid(x - 1, y) !== solid(x, y) && !coveredBy({ dir: 'v', x, y }, g, manual);
      if (wall && start < 0) start = y;
      if (!wall && start >= 0) {
        push(x, start, x, y);
        start = -1;
      }
    }
  }
  return out;
}

/** Cambia las paredes automáticas por las que salen del terreno actual (las puestas a mano se quedan). */
export function withAutoWalls(walls: Wall[], terrain: string, w: number, h: number, g: number): Wall[] {
  const manual = walls.filter((x) => !x.auto);
  return [...manual, ...wallsFromTerrain(terrain, w, h, g, manual)];
}

/** Lado de casilla más cercano a un punto (en píxeles de escena), como segmento de pared. */
export function nearestCellEdge(px: number, py: number, g: number) {
  const fx = px / g;
  const fy = py / g;
  const dx = Math.abs(fx - Math.round(fx));
  const dy = Math.abs(fy - Math.round(fy));
  if (dx < dy) {
    const x = Math.round(fx);
    const y = Math.floor(fy);
    return { x1: x * g, y1: y * g, x2: x * g, y2: (y + 1) * g };
  }
  const x = Math.floor(fx);
  const y = Math.round(fy);
  return { x1: x * g, y1: y * g, x2: (x + 1) * g, y2: y * g };
}

// ---------- Generadores ----------

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DungeonOptions {
  seed: number;
  /** Cuántas salas intentar colocar. */
  rooms?: number;
  /** Suelo de las salas y de los pasillos. */
  floor?: string;
  corridor?: string;
  /** Lado mínimo y máximo de las salas en casillas (por defecto, de 3 a 9 de ancho y de 3 a 7 de alto). */
  minRoom?: number;
  maxRoom?: number;
}

/** Rectángulo en casillas. */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedMap {
  terrain: string;
  /** Puertas a mano (en casillas: lado entre dos casillas). */
  doors: { x1: number; y1: number; x2: number; y2: number }[];
  /** Salas de la mazmorra (para amueblarlas); las cuevas no tienen. */
  rooms?: CellRect[];
}

/**
 * Mazmorra: salas rectangulares que no se tocan, unidas en cadena por pasillos en L
 * (todas quedan conectadas), con puertas en algunas entradas estrechas.
 */
export function generateDungeon(w: number, h: number, opts: DungeonOptions): GeneratedMap {
  const rnd = seededRng(opts.seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const floor = opts.floor ?? 'p';
  const corridor = opts.corridor ?? 'c';
  const target = opts.rooms ?? Math.max(3, Math.round((w * h) / 90));
  const cells: string[] = emptyTerrain(w, h).split('');
  const roomOf = new Int16Array(w * h).fill(-1);
  const rooms: CellRect[] = [];
  const min = Math.max(2, opts.minRoom ?? 3);

  for (let tries = 0; tries < target * 30 && rooms.length < target; tries++) {
    const rw = int(min, Math.max(min, Math.min(opts.maxRoom ?? 9, Math.floor(w / 3))));
    const rh = int(min, Math.max(min, Math.min(opts.maxRoom ?? 7, Math.floor(h / 3))));
    if (rw + 2 > w || rh + 2 > h) break;
    const r = { x: int(1, w - rw - 1), y: int(1, h - rh - 1), w: rw, h: rh };
    // Una casilla de separación como mínimo entre salas.
    if (rooms.some((o) => r.x - 1 < o.x + o.w && r.x + r.w + 1 > o.x && r.y - 1 < o.y + o.h && r.y + r.h + 1 > o.y)) continue;
    rooms.push(r);
  }
  rooms.forEach((r, n) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        cells[y * w + x] = floor;
        roomOf[y * w + x] = n;
      }
  });

  // Pasillos: cada sala con la siguiente (ordenadas de izquierda a derecha).
  const order = [...rooms].sort((a, b) => a.x + a.w / 2 - (b.x + b.w / 2));
  const dig = (x: number, y: number) => {
    if (cells[y * w + x] === TERRAIN_EMPTY) cells[y * w + x] = corridor;
  };
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1]!;
    const b = order[i]!;
    const ax = int(a.x, a.x + a.w - 1);
    const ay = int(a.y, a.y + a.h - 1);
    const bx = int(b.x, b.x + b.w - 1);
    const by = int(b.y, b.y + b.h - 1);
    const horizontalFirst = rnd() < 0.5;
    const [cx, cy] = horizontalFirst ? [bx, ay] : [ax, by];
    for (let x = Math.min(ax, cx); x <= Math.max(ax, cx); x++) dig(x, horizontalFirst ? ay : cy);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) dig(cx, y);
    for (let x = Math.min(cx, bx); x <= Math.max(cx, bx); x++) dig(x, by);
  }

  // Puertas: donde un pasillo de una casilla de ancho entra en una sala.
  const terrain = cells.join('');
  const isCorr = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && terrain[y * w + x] === corridor;
  const isOpen = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !isSolidCell(terrain[y * w + x]);
  const doors: GeneratedMap['doors'] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!isCorr(x, y)) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || roomOf[ny * w + nx]! < 0) continue;
        // Entrada estrecha: a los lados del pasillo no hay suelo.
        const narrow = dx !== 0 ? !isOpen(x, y - 1) && !isOpen(x, y + 1) : !isOpen(x - 1, y) && !isOpen(x + 1, y);
        if (!narrow || rnd() > 0.7) continue;
        const ex = dx > 0 ? x + 1 : dx < 0 ? x : x;
        const ey = dy > 0 ? y + 1 : dy < 0 ? y : y;
        doors.push(dx !== 0 ? { x1: ex, y1: y, x2: ex, y2: y + 1 } : { x1: x, y1: ey, x2: x + 1, y2: ey });
      }
    }
  return { terrain, doors, rooms };
}

/** Cueva: autómata celular sobre ruido; se queda la zona abierta más grande y el resto es roca. */
export function generateCave(w: number, h: number, opts: { seed: number; floor?: string; fill?: number; steps?: number }): GeneratedMap {
  const rnd = seededRng(opts.seed);
  const floor = opts.floor ?? 'o';
  const fill = opts.fill ?? 0.45;
  let wall = Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1 || rnd() < fill;
  });
  for (let s = 0; s < (opts.steps ?? 4); s++) {
    wall = wall.map((_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || wall[ny * w + nx]) n++;
        }
      return n >= 5;
    });
  }
  // Zona abierta más grande.
  const region = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let i = 0, id = 0; i < w * h; i++) {
    if (wall[i] || region[i]! >= 0) continue;
    let size = 0;
    const stack = [i];
    region[i] = id;
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const x = j % w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) {
        if (k < 0 || k >= w * h || wall[k] || region[k]! >= 0) continue;
        region[k] = id;
        stack.push(k);
      }
    }
    if (size > bestSize) [best, bestSize] = [id, size];
    id++;
  }
  const terrain = Array.from({ length: w * h }, (_, i) => (region[i] === best && best >= 0 ? floor : 'r')).join('');
  return { terrain, doors: [] };
}
