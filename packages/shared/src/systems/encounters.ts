import { crValue, monsterById, MONSTERS } from '../compendium/monsters.js';
import { tr } from '../i18n/index.js';

/**
 * Dificultad de los encuentros de 5e (SRD 5.1, «Creating Encounters»): se suma la PX de los
 * monstruos, se multiplica según cuántos son y se compara con los umbrales del grupo.
 * Son las reglas de 5e, igual que el compendio de monstruos.
 */

/** PX por valor de desafío. */
export const CR_XP: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '30': 155000,
};

export const xpOfCr = (cr: string) => CR_XP[cr] ?? CR_XP[String(Math.round(crValue(cr)))] ?? 0;

export const DIFFICULTIES = ['trivial', 'easy', 'medium', 'hard', 'deadly'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = { trivial: tr('Trivial'), easy: tr('Fácil'), medium: tr('Media'), hard: tr('Difícil'), deadly: tr('Mortal') };

/** Umbrales de PX por personaje según su nivel: fácil, media, difícil y mortal. */
const THRESHOLDS: [number, number, number, number][] = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

/** Multiplicadores por número de monstruos (con uno más por cada lado para grupos pequeños o grandes). */
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

function multiplierIndex(monsters: number): number {
  if (monsters <= 1) return 1;
  if (monsters === 2) return 2;
  if (monsters <= 6) return 3;
  if (monsters <= 10) return 4;
  if (monsters <= 14) return 5;
  return 6;
}

/** Multiplicador de PX: con menos de 3 personajes se sube un escalón; con 6 o más, se baja uno. */
export function encounterMultiplier(monsters: number, partySize: number): number {
  if (monsters <= 0) return 0;
  let i = multiplierIndex(monsters);
  if (partySize < 3) i++;
  else if (partySize >= 6) i--;
  return MULTIPLIERS[Math.max(0, Math.min(MULTIPLIERS.length - 1, i))]!;
}

/** Umbrales del grupo: la suma de los de cada personaje (niveles de 1 a 20). */
export function partyThresholds(levels: number[]): { easy: number; medium: number; hard: number; deadly: number } {
  const sum = [0, 0, 0, 0];
  for (const l of levels) {
    const t = THRESHOLDS[Math.max(1, Math.min(20, Math.round(l) || 1)) - 1]!;
    t.forEach((v, i) => (sum[i]! += v));
  }
  return { easy: sum[0]!, medium: sum[1]!, hard: sum[2]!, deadly: sum[3]! };
}

export interface EncounterRating {
  /** PX que reparte el encuentro (la suma sin multiplicar). */
  xp: number;
  /** PX ajustada (con el multiplicador), la que mide la dificultad. */
  adjustedXp: number;
  monsters: number;
  multiplier: number;
  difficulty: Difficulty;
  thresholds: ReturnType<typeof partyThresholds>;
}

/** Dificultad de un grupo de monstruos del compendio para un grupo de personajes de esos niveles. */
export function rateEncounter(entries: { monsterId: string; count: number }[], levels: number[]): EncounterRating {
  let xp = 0;
  let monsters = 0;
  for (const e of entries) {
    const m = monsterById(e.monsterId);
    if (!m) continue;
    xp += xpOfCr(m.cr) * e.count;
    monsters += e.count;
  }
  const multiplier = encounterMultiplier(monsters, levels.length);
  const adjustedXp = Math.round(xp * multiplier);
  const thresholds = partyThresholds(levels);
  const difficulty: Difficulty =
    !levels.length || adjustedXp < thresholds.easy
      ? 'trivial'
      : adjustedXp < thresholds.medium
        ? 'easy'
        : adjustedXp < thresholds.hard
          ? 'medium'
          : adjustedXp < thresholds.deadly
            ? 'hard'
            : 'deadly';
  return { xp, adjustedXp, monsters, multiplier, difficulty, thresholds };
}

/** Hasta qué PX ajustada llega cada dificultad (la siguiente marca el tope; la mortal, una vez y media). */
function band(difficulty: Exclude<Difficulty, 'trivial'>, t: ReturnType<typeof partyThresholds>): [number, number] {
  switch (difficulty) {
    case 'easy':
      return [t.easy, t.medium];
    case 'medium':
      return [t.medium, t.hard];
    case 'hard':
      return [t.hard, t.deadly];
    case 'deadly':
      return [t.deadly, Math.round(t.deadly * 1.5)];
  }
}

/**
 * Propone un encuentro al azar de la dificultad pedida: uno o dos tipos de monstruo del compendio
 * con un VD razonable para el nivel del grupo, repetidos hasta caer en la franja de esa dificultad.
 * `rnd` da números entre 0 y 1 (Math.random, o uno con semilla en los tests).
 */
export function suggestEncounter(levels: number[], difficulty: Exclude<Difficulty, 'trivial'>, rnd: () => number = Math.random): { monsterId: string; count: number }[] {
  if (!levels.length) return [];
  const [low, high] = band(difficulty, partyThresholds(levels));
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  // Nada que por sí solo pase del tope, ni con un VD muy por encima del nivel medio.
  const pool = MONSTERS_BY_XP.filter((m) => xpOfCr(m.cr) <= high && crValue(m.cr) <= Math.max(1, avg + 2));
  if (!pool.length) return [];
  const pick = () => pool[Math.floor(rnd() * pool.length)]!;
  for (let attempt = 0; attempt < 200; attempt++) {
    const types = rnd() < 0.5 ? [pick()] : [pick(), pick()];
    const counts = new Map<string, number>();
    for (let n = 0; n < 12; n++) {
      const m = types[n % types.length]!;
      counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
      const entries = [...counts].map(([monsterId, count]) => ({ monsterId, count }));
      const { adjustedXp } = rateEncounter(entries, levels);
      if (adjustedXp >= high) break;
      if (adjustedXp >= low) return entries;
    }
  }
  return [];
}

const MONSTERS_BY_XP = [...MONSTERS].sort((a, b) => crValue(a.cr) - crValue(b.cr));
