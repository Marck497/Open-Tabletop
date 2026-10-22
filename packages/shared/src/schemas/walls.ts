import { z } from 'zod';
import type { Point } from './measure.js';
import { eyeSees, type Eye, type LightSource } from './lights.js';

/**
 * Paredes, puertas y visión. Las paredes son segmentos en coordenadas de escena:
 * - wall: bloquea el paso y la vista.
 * - door: como una pared mientras está cerrada; los jugadores la abren si no tiene llave.
 * - window: bloquea el paso pero deja ver.
 * - secret: puerta secreta; para los jugadores es una pared normal hasta que el DM la abre.
 */
export const WALL_KINDS = ['wall', 'door', 'window', 'secret'] as const;
export type WallKind = (typeof WALL_KINDS)[number];

export const WALL_LABELS: Record<WallKind, string> = {
  wall: 'Pared',
  door: 'Puerta',
  window: 'Ventana',
  secret: 'Puerta secreta',
};

export const WALL_COLORS: Record<WallKind, string> = {
  wall: '#e8b25a',
  door: '#5fb3e8',
  window: '#9be89b',
  secret: '#c77de8',
};

export const MAX_WALLS = 2000;

export const wallSchema = z.object({
  id: z.string().min(1).max(40),
  x1: z.number().finite(),
  y1: z.number().finite(),
  x2: z.number().finite(),
  y2: z.number().finite(),
  kind: z.enum(WALL_KINDS),
  /** Puertas: abierta o cerrada. */
  open: z.boolean().default(false),
  /** Puertas: con llave, los jugadores no pueden abrirla. */
  locked: z.boolean().default(false),
  /** Generada sola a partir del suelo pintado (se rehace al repintar). */
  auto: z.boolean().optional(),
});
export type Wall = z.infer<typeof wallSchema>;
export type WallInput = z.input<typeof wallSchema>;
export const wallsSchema = z.array(wallSchema).max(MAX_WALLS);

export const isDoor = (w: Pick<Wall, 'kind'>) => w.kind === 'door' || w.kind === 'secret';

/** ¿Tapa la vista? */
export const blocksSight = (w: Wall) => (isDoor(w) ? !w.open : w.kind === 'wall');
/** ¿Impide el paso? */
export const blocksMove = (w: Wall) => (isDoor(w) ? !w.open : true);

/** Lo que ve un jugador de las paredes: las puertas secretas cerradas parecen paredes. */
export function wallsForPlayer(walls: Wall[]): Wall[] {
  return walls.map((w) => (w.kind !== 'secret' ? w : w.open ? { ...w, kind: 'door', locked: true } : { ...w, kind: 'wall', open: false, locked: false }));
}

// ---------- Geometría ----------

const EPS = 1e-9;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** ¿Se cruzan los segmentos AB y CD? Los extremos de AB no cuentan (tocar una pared con la punta no la atraviesa). */
export function segmentCrosses(ax: number, ay: number, bx: number, by: number, w: Pick<Wall, 'x1' | 'y1' | 'x2' | 'y2'>): boolean {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = w.x2 - w.x1;
  const sy = w.y2 - w.y1;
  const denom = cross(rx, ry, sx, sy);
  if (Math.abs(denom) < EPS) return false; // Paralelos: no se cruzan de forma que tape.
  const qx = w.x1 - ax;
  const qy = w.y1 - ay;
  const t = cross(qx, qy, sx, sy) / denom;
  const u = cross(qx, qy, rx, ry) / denom;
  return t > 1e-6 && t < 1 - 1e-6 && u >= -1e-6 && u <= 1 + 1e-6;
}

/** ¿Hay línea de visión de A a B? `skip` permite ignorar una pared (p. ej. la puerta que se mira). */
export function hasLineOfSight(a: Point, b: Point, walls: Wall[], skip?: string): boolean {
  for (const w of walls) {
    if (w.id !== skip && blocksSight(w) && segmentCrosses(a.x, a.y, b.x, b.y, w)) return false;
  }
  return true;
}

/** ¿Puede ir en línea recta de A a B sin atravesar paredes? */
export function canMoveStraight(a: Point, b: Point, walls: Wall[]): boolean {
  for (const w of walls) if (blocksMove(w) && segmentCrosses(a.x, a.y, b.x, b.y, w)) return false;
  return true;
}

/**
 * Índice de paredes por casillas para comprobar muchos tramos cortos (la IA buscando camino)
 * sin recorrer todas las paredes cada vez.
 */
export function wallGrid(walls: Wall[], cellSize: number, filter: (w: Wall) => boolean) {
  const buckets = new Map<string, Wall[]>();
  for (const w of walls) {
    if (!filter(w)) continue;
    const c0 = Math.floor(Math.min(w.x1, w.x2) / cellSize);
    const c1 = Math.floor(Math.max(w.x1, w.x2) / cellSize);
    const r0 = Math.floor(Math.min(w.y1, w.y2) / cellSize);
    const r1 = Math.floor(Math.max(w.y1, w.y2) / cellSize);
    // Paredes muy largas: se apuntan en todas las casillas de su caja (como mucho 200×200).
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      const k = `${c},${r}`;
      const list = buckets.get(k);
      if (list) list.push(w);
      else buckets.set(k, [w]);
    }
  }
  /** ¿Cruza alguna pared el tramo de A a B? */
  return (a: Point, b: Point): boolean => {
    const c0 = Math.floor(Math.min(a.x, b.x) / cellSize);
    const c1 = Math.floor(Math.max(a.x, b.x) / cellSize);
    const r0 = Math.floor(Math.min(a.y, b.y) / cellSize);
    const r1 = Math.floor(Math.max(a.y, b.y) / cellSize);
    for (let c = c0; c <= c1; c++)
      for (let r = r0; r <= r1; r++) for (const w of buckets.get(`${c},${r}`) ?? []) if (segmentCrosses(a.x, a.y, b.x, b.y, w)) return true;
    return false;
  };
}

/**
 * Polígono de lo que se ve desde `origin`: se lanzan rayos hacia los extremos de las paredes
 * (y en todas direcciones si hay alcance máximo) y se queda el primer choque de cada uno.
 */
export function visibilityPolygon(origin: Point, walls: Wall[], width: number, height: number, range = 0): Point[] {
  const segs = walls.filter(blocksSight).map((w) => [w.x1, w.y1, w.x2, w.y2] as const);
  segs.push([0, 0, width, 0], [width, 0, width, height], [width, height, 0, height], [0, height, 0, 0]);
  const angles: number[] = [];
  for (const [x1, y1, x2, y2] of segs) {
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ] as const) {
      if (range && Math.hypot(x - origin.x, y - origin.y) > range * 1.5) continue;
      const a = Math.atan2(y - origin.y, x - origin.x);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }
  if (range) for (let i = 0; i < 72; i++) angles.push(-Math.PI + (i * Math.PI) / 36);
  angles.sort((a, b) => a - b);

  const out: Point[] = [];
  let last = NaN;
  for (const a of angles) {
    if (a - last < 1e-7) continue;
    last = a;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = range || Infinity;
    for (const [x1, y1, x2, y2] of segs) {
      const sx = x2 - x1;
      const sy = y2 - y1;
      const denom = cross(dx, dy, sx, sy);
      if (Math.abs(denom) < EPS) continue;
      const qx = x1 - origin.x;
      const qy = y1 - origin.y;
      const t = cross(qx, qy, sx, sy) / denom;
      const u = cross(qx, qy, dx, dy) / denom;
      if (t >= 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    if (best === Infinity) continue;
    out.push({ x: origin.x + dx * best, y: origin.y + dy * best });
  }
  return out;
}

/** ¿Está el punto dentro del polígono? (regla par-impar) */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Puntos de un token que cuentan para verlo: el centro y las esquinas un poco hacia dentro. */
export function samplePoints(r: { x: number; y: number; width: number; height: number }): Point[] {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const ix = r.width * 0.35;
  const iy = r.height * 0.35;
  return [
    { x: cx, y: cy },
    { x: cx - ix, y: cy - iy },
    { x: cx + ix, y: cy - iy },
    { x: cx - ix, y: cy + iy },
    { x: cx + ix, y: cy + iy },
  ];
}

/**
 * ¿Ve alguno de los ojos el rectángulo? `range` en píxeles (0 = sin límite).
 * Con `lights` (escena a oscuras), el punto visto además debe estar iluminado o al alcance de la visión en la oscuridad.
 */
export function seesRect(
  eyes: Eye[],
  r: { x: number; y: number; width: number; height: number },
  walls: Wall[],
  range = 0,
  lights: LightSource[] | null = null,
): boolean {
  const pts = samplePoints(r);
  return eyes.some((e) => pts.some((p) => eyeSees(e, p, walls, range, lights)));
}
