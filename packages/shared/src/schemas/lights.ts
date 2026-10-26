import { z } from 'zod';
import type { Point } from './measure.js';
import { hasLineOfSight, type Wall } from './walls.js';

/**
 * Luces y visión en la oscuridad. Con la escena a oscuras (`scene.lighting`), un jugador
 * solo ve lo que está en su línea de visión Y además iluminado por alguna luz o dentro
 * de su visión en la oscuridad. Las distancias se guardan en la unidad de la escena (pies en 5e).
 */
export const lightSchema = z.object({
  /** Radio de luz brillante. */
  bright: z.number().min(0).max(1000),
  /** Luz tenue más allá de la brillante (como en 5e: «y tenue 20 pies más»). */
  dim: z.number().min(0).max(1000),
  /** Tono de la luz (solo se nota un poco al pintarla). */
  color: z.string().max(32).default('#ffb74d'),
});
export type Light = z.infer<typeof lightSchema>;
export type LightInput = z.input<typeof lightSchema>;

/** Luces típicas de 5e (radio brillante + tenue adicional, en pies). */
export const LIGHT_PRESETS: { label: string; light: Light }[] = [
  { label: 'Vela', light: { bright: 5, dim: 5, color: '#ffcc80' } },
  { label: 'Antorcha', light: { bright: 20, dim: 20, color: '#ffb74d' } },
  { label: 'Lámpara', light: { bright: 15, dim: 30, color: '#ffd180' } },
  { label: 'Linterna', light: { bright: 30, dim: 30, color: '#ffe0b2' } },
  { label: 'Luz (truco)', light: { bright: 20, dim: 20, color: '#fff8e1' } },
  { label: 'Luz del día (conjuro)', light: { bright: 60, dim: 60, color: '#fffde7' } },
];

/** Visión en la oscuridad típica (pies). */
export const DARKVISION_PRESETS = [0, 30, 60, 90, 120] as const;

/** Una luz ya colocada en la escena, en píxeles. `radius` = alcance total (brillante + tenue). */
export interface LightSource {
  x: number;
  y: number;
  bright: number;
  radius: number;
  color: string;
}

/** Desde dónde mira un token. `darkvision` en píxeles (0 = no tiene). */
export interface Eye extends Point {
  darkvision?: number;
}

type SceneScale = { gridSize: number; cellDistance: number };
type Lit = { x: number; y: number; width: number; height: number; light?: Light | null; drawing?: { type: string } | null };

/** ¿Puede dar luz? Los tokens e imágenes sí, y de los dibujos solo los objetos (una hoguera, una vela). */
export const canGiveLight = (i: Pick<Lit, 'drawing'>) => !i.drawing || i.drawing.type === 'stamp';

/** Pasa una distancia de la escena (pies) a píxeles. */
export const distToPx = (d: number, scene: SceneScale) => (scene.cellDistance > 0 ? (d / scene.cellDistance) * scene.gridSize : 0);

/** Las luces de los elementos (de cualquier capa: una luz en la capa del DM ilumina sin verse). */
export function lightsOf(items: Lit[], scene: SceneScale): LightSource[] {
  const out: LightSource[] = [];
  for (const i of items) {
    if (!i.light || !canGiveLight(i)) continue;
    const bright = distToPx(i.light.bright, scene);
    const radius = bright + distToPx(i.light.dim, scene);
    if (radius <= 0) continue;
    out.push({ x: i.x + i.width / 2, y: i.y + i.height / 2, bright, radius, color: i.light.color });
  }
  return out;
}

/** El ojo de un token: su centro y su visión en la oscuridad. */
export function eyeOf(i: { x: number; y: number; width: number; height: number; darkvision?: number }, scene: SceneScale): Eye {
  return { x: i.x + i.width / 2, y: i.y + i.height / 2, darkvision: distToPx(i.darkvision ?? 0, scene) };
}

/** ¿Llega alguna luz al punto? (dentro de su alcance y sin paredes en medio) */
export function isLit(p: Point, lights: LightSource[], walls: Wall[]): boolean {
  return lights.some((l) => Math.hypot(p.x - l.x, p.y - l.y) <= l.radius && hasLineOfSight(l, p, walls));
}

/**
 * ¿Ve el ojo el punto? Hace falta línea de visión (y estar dentro de `range` si lo hay) y,
 * si `lights` no es null (escena a oscuras), que el punto esté iluminado o al alcance de su visión en la oscuridad.
 */
export function eyeSees(e: Eye, p: Point, walls: Wall[], range: number, lights: LightSource[] | null): boolean {
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (range && d > range) return false;
  if (!hasLineOfSight(e, p, walls)) return false;
  if (!lights) return true;
  return d <= (e.darkvision ?? 0) || isLit(p, lights, walls);
}

/**
 * Luces que un jugador necesita para pintar su vista: las que iluminan algo que alguno de sus
 * ojos ve. Así no se le envía la posición de una antorcha que está al otro lado de una pared.
 * `bounds` (tamaño de la escena en píxeles) descarta los puntos de fuera, por donde la luz rodearía las paredes.
 */
export function lightsSeenBy(eyes: Eye[], lights: LightSource[], walls: Wall[], range: number, bounds?: { width: number; height: number }): LightSource[] {
  if (!eyes.length) return [];
  return lights.filter((l) => {
    for (const f of [0, 0.35, 0.7, 0.97]) {
      const steps = f === 0 ? 1 : 12;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const p = { x: l.x + Math.cos(a) * l.radius * f, y: l.y + Math.sin(a) * l.radius * f };
        if (bounds && (p.x < 0 || p.y < 0 || p.x > bounds.width || p.y > bounds.height)) continue;
        if (f && !hasLineOfSight(l, p, walls)) continue;
        if (eyes.some((e) => (!range || Math.hypot(p.x - e.x, p.y - e.y) <= range) && hasLineOfSight(e, p, walls))) return true;
      }
    }
    return false;
  });
}
