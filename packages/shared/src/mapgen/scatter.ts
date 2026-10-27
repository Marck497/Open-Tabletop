import { tr } from '../i18n/index.js';
/**
 * Pincel de objetos: al arrastrar, esparce objetos (emojis) por las casillas que toca el pincel,
 * al azar y sin amontonarlos. Cada casilla se sortea una sola vez por trazo, para que pasar dos
 * veces por el mismo sitio no lo llene del todo.
 */

export const SCATTER_DENSITIES = ['low', 'medium', 'high'] as const;
export type ScatterDensity = (typeof SCATTER_DENSITIES)[number];
export const SCATTER_DENSITY_LABELS: Record<ScatterDensity, string> = {
  low: tr('Pocos'),
  medium: tr('Normal'),
  high: tr('Muchos'),
};
/** Probabilidad de que salga un objeto en cada casilla libre. */
const CHANCE: Record<ScatterDensity, number> = {
  low: 0.12,
  medium: 0.3,
  high: 0.6,
};

export interface ScatterStroke {
  /** Casillas ocupadas (por objetos que ya estaban o por los de este trazo), como «x,y». */
  occupied: Set<string>;
  /** Casillas ya sorteadas en este trazo. */
  rolled: Set<string>;
}

export interface ScatterOptions {
  /** Casilla bajo el ratón. */
  x: number;
  y: number;
  /** Lado del pincel y de cada objeto, en casillas. */
  brush: number;
  size: number;
  density: ScatterDensity;
  /** Objetos entre los que se elige al azar. */
  emojis: string[];
  /** ¿Se puede poner un objeto con su esquina en esa casilla? (dentro de la escena, no en un muro…) */
  allowed: (x: number, y: number) => boolean;
  rnd: () => number;
}

export const newScatterStroke = (occupied: Iterable<string> = []): ScatterStroke => ({ occupied: new Set(occupied), rolled: new Set() });

/** Casillas que tapa un objeto de lado `size` con su esquina en (x, y). */
export function cellsOf(x: number, y: number, size: number): string[] {
  const out: string[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push(`${x + dx},${y + dy}`);
  return out;
}

/** Un paso del pincel: los objetos nuevos que salen en la zona del pincel (y los apunta en el trazo). */
export function scatterStep(stroke: ScatterStroke, o: ScatterOptions): { emoji: string; x: number; y: number }[] {
  if (!o.emojis.length) return [];
  const r0 = Math.floor((o.brush - 1) / 2);
  const out: { emoji: string; x: number; y: number }[] = [];
  for (let y = o.y - r0; y < o.y - r0 + o.brush; y++)
    for (let x = o.x - r0; x < o.x - r0 + o.brush; x++) {
      const key = `${x},${y}`;
      if (stroke.rolled.has(key)) continue;
      stroke.rolled.add(key);
      if (o.rnd() >= CHANCE[o.density]) continue;
      const cells = cellsOf(x, y, o.size);
      if (cells.some((c) => stroke.occupied.has(c))) continue;
      if (!o.allowed(x, y)) continue;
      cells.forEach((c) => stroke.occupied.add(c));
      out.push({
        emoji: o.emojis[Math.floor(o.rnd() * o.emojis.length)]!,
        x,
        y,
      });
    }
  return out;
}
