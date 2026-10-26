import { z } from 'zod';
import { checkSyntax } from '../expr.js';
import type { Point } from './measure.js';

/**
 * Trampas y zonas de aviso: un rectángulo en la capa del DM que «salta» cuando un token entra en él.
 * - Trampa: puede pedir una salvación y hacer daño al token que la pisa (se tira y se aplica solo).
 * - Zona de aviso: solo avisa al DM (y, si se quiere, cuenta algo en el chat o descubre lo que hay dentro,
 *   p. ej. los monstruos de una emboscada escondidos en la capa del DM).
 * La configuración nunca llega a los jugadores.
 */

export const TRIGGER_KINDS = ['trap', 'zone'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];
export const TRIGGER_LABELS: Record<TriggerKind, string> = { trap: 'Trampa', zone: 'Zona de aviso' };
export const TRIGGER_ICONS: Record<TriggerKind, string> = { trap: '🪤', zone: '❗' };
/** Color del rectángulo (lo ve solo el DM). */
export const TRIGGER_COLORS: Record<TriggerKind, string> = { trap: '#e0533d', zone: '#4d9de0' };

/** Quién la dispara: los tokens de los jugadores o cualquier token (también monstruos). */
export const TRIGGER_WHO = ['players', 'all'] as const;
export const TRIGGER_WHO_LABELS: Record<(typeof TRIGGER_WHO)[number], string> = { players: 'Tokens de jugadores', all: 'Cualquier token' };

const expr = z
  .string()
  .trim()
  .max(60)
  .refine((v) => !v || !checkSyntax(v), { message: 'Daño: fórmula no válida' });

export const triggerSchema = z.object({
  kind: z.enum(TRIGGER_KINDS),
  /** Armada: salta al entrar. Las de una sola vez se desarman al saltar. */
  active: z.boolean().default(true),
  once: z.boolean().default(true),
  who: z.enum(TRIGGER_WHO).default('players'),
  /** Lo que se cuenta a todos en el chat al saltar ('' = nada): «¡El suelo cede bajo tus pies!». */
  message: z.string().trim().max(1000).default(''),
  /** Salvación (característica como en las creaciones: la parte {a} del patrón de salvaciones de la plantilla). */
  save: z.string().trim().max(48).default(''),
  dc: z.number().int().min(1).max(40).default(13),
  /** Al salvar, la mitad del daño (si no, nada). */
  half: z.boolean().default(true),
  /** Daño (fórmula: «2d10») y su tipo. */
  damage: expr.default(''),
  damageType: z.string().trim().max(40).default(''),
  /** Al saltar, lo que haya dentro en la capa del DM pasa a la de tokens (los jugadores lo ven); si es una trampa, ella también. */
  reveal: z.boolean().default(false),
});
export type Trigger = z.infer<typeof triggerSchema>;
export type TriggerInput = z.input<typeof triggerSchema>;

export interface ZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inside = (p: Point, r: ZoneRect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

/** ¿Toca el tramo de A a B el rectángulo? (recorte de Liang-Barsky) */
export function segmentHitsRect(a: Point, b: Point, r: ZoneRect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  // Bordes abiertos: rozar el borde por fuera no cuenta.
  return clip(-dx, a.x - r.x) && clip(dx, r.x + r.w - a.x) && clip(-dy, a.y - r.y) && clip(dy, r.y + r.h - a.y) && t0 < t1 && (t1 - t0) * Math.hypot(dx, dy) > 0.5;
}

/**
 * ¿Entra en la zona un token que va por estos puntos (centros: origen, giros y destino)? Solo si
 * empieza fuera: moverse dentro de la zona no la vuelve a disparar.
 */
export function pathEntersRect(points: Point[], r: ZoneRect): boolean {
  if (points.length < 2 || inside(points[0]!, r)) return false;
  for (let i = 1; i < points.length; i++) if (segmentHitsRect(points[i - 1]!, points[i]!, r) || inside(points[i]!, r)) return true;
  return false;
}
