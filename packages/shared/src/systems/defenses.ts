import { allFields, type SheetTemplate, type SheetValues } from '../schemas/sheet.js';
import { combatOf, statusesOf } from './index.js';

/**
 * Resistencias, inmunidades y vulnerabilidades al daño (como en 5e): la inmunidad anula el daño
 * de ese tipo, la resistencia lo divide entre dos (redondeando hacia abajo) y la vulnerabilidad lo
 * dobla; resistencia y vulnerabilidad al mismo tipo se anulan. Salen de la hoja (los campos que
 * marca `combat.defenses` en la plantilla) y de los estados del token (furia, petrificado...).
 */
export interface Defenses {
  resist: string[];
  immune: string[];
  vulnerable: string[];
}

/** Daño de un tipo ('' = sin tipo). */
export interface DamagePiece {
  type: string;
  amount: number;
}

/** Palabras que significan «cualquier tipo de daño». */
const ALL = new Set(['todo', 'todos', 'cualquiera', 'all', 'any']);

/** Los tipos de daño en inglés cuentan como su nombre en español, para mezclar hojas y mesas de los dos idiomas. */
const ENGLISH_TYPES: Record<string, string> = {
  acid: 'acido',
  bludgeoning: 'contundente',
  slashing: 'cortante',
  cold: 'frio',
  fire: 'fuego',
  force: 'fuerza',
  necrotic: 'necrotico',
  piercing: 'perforante',
  psychic: 'psiquico',
  radiant: 'radiante',
  lightning: 'relampago',
  thunder: 'trueno',
  poison: 'veneno',
  everything: 'todo',
};

/** Minúsculas, sin tildes y en español, para comparar «Relámpago» con «relampago» o «lightning». */
export const normalizeDamageType = (t: string) => {
  const n = t
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return n.replace(/^[a-z]+/, (w) => ENGLISH_TYPES[w] ?? w);
};

/** «fuego, frío y veneno» → ['fuego', 'frio', 'veneno'] (normalizados). */
export function parseDamageTypes(text: string): string[] {
  return text
    .split(/[,;/\n]|\s+(?:y|e|and)\s+/)
    .map(normalizeDamageType)
    .filter(Boolean);
}

const fieldText = (values: SheetValues, key: string | undefined) => (key && typeof values[key] === 'string' ? (values[key] as string) : '');

/** Defensas de una hoja y de los estados marcados en su token. */
export function defensesOf(template: SheetTemplate, values: SheetValues | null, statuses: string[] = []): Defenses {
  const map = combatOf(template)?.defenses;
  const keys = new Set(allFields(template).map((f) => f.key));
  const read = (k: string | undefined) => (values && k && keys.has(k) ? parseDamageTypes(fieldText(values, k)) : []);
  const fromStatuses = statusesOf(template)
    .filter((s) => s.resist && statuses.includes(s.id))
    .flatMap((s) => parseDamageTypes(s.resist!));
  return { resist: [...read(map?.resist), ...fromStatuses], immune: read(map?.immune), vulnerable: read(map?.vulnerable) };
}

/** ¿Está el tipo en la lista? Un daño sin tipo solo cuenta con «todo». */
function has(list: string[], type: string): boolean {
  const t = normalizeDamageType(type);
  return list.some((x) => ALL.has(x) || (t !== '' && (x === t || t.startsWith(`${x} `))));
}

/** Qué le pasa a un tipo de daño: ×0, ×½, ×1 o ×2. */
export function damageModifier(def: Defenses, type: string): 'immune' | 'resist' | 'vulnerable' | null {
  if (has(def.immune, type)) return 'immune';
  const r = has(def.resist, type);
  const v = has(def.vulnerable, type);
  if (r && !v) return 'resist';
  if (v && !r) return 'vulnerable';
  return null;
}

const MOD_LABEL = { immune: 'inmune', resist: 'resiste', vulnerable: 'vulnerable' } as const;

/**
 * Aplica las defensas a los daños por tipo. Devuelve el total y notas como «resiste fuego»
 * para el resumen del chat.
 */
export function applyDefenses(pieces: DamagePiece[], def: Defenses): { total: number; notes: string[] } {
  let total = 0;
  const notes: string[] = [];
  for (const p of pieces) {
    const mod = damageModifier(def, p.type);
    const amount = mod === 'immune' ? 0 : mod === 'resist' ? Math.floor(p.amount / 2) : mod === 'vulnerable' ? p.amount * 2 : p.amount;
    total += amount;
    if (mod && p.amount > 0) {
      const note = `${MOD_LABEL[mod]}${p.type ? ` ${p.type}` : ''}`;
      if (!notes.includes(note)) notes.push(note);
    }
  }
  return { total, notes };
}

/** Tipos de daño conocidos que aparecen en un texto (p. ej. «1d6 fuego» → ['fuego']). */
export function damageTypesIn(text: string, known: string[]): string[] {
  const t = ` ${normalizeDamageType(text).replace(/[a-z]+/g, (w) => ENGLISH_TYPES[w] ?? w)} `;
  return known.filter((k) => new RegExp(`[^a-z]${normalizeDamageType(k)}[^a-z]`).test(t));
}

/**
 * Defensas escritas en los rasgos de un monstruo del compendio («Inmune al fuego.»,
 * «Vulnerable al daño contundente.», «Resistente a armas no mágicas.»).
 */
export function traitDefenses(traits: string, known: string[]): Defenses {
  const out: Defenses = { resist: [], immune: [], vulnerable: [] };
  for (const sentence of traits.split(/[.\n]/)) {
    const s = normalizeDamageType(sentence);
    const kind = /\binmune/.test(s) ? 'immune' : /\bvulnerable/.test(s) ? 'vulnerable' : /\bresistente/.test(s) ? 'resist' : null;
    if (!kind) continue;
    const types = damageTypesIn(sentence, known);
    if (/armas no magicas/.test(s)) types.push('contundente', 'perforante', 'cortante');
    out[kind].push(...types.filter((t) => !out[kind].includes(t)));
  }
  return out;
}

/** CD de la salvación de concentración al recibir daño (5e: 10 o la mitad del daño, lo que sea mayor). */
export const concentrationDc = (damage: number) => Math.max(10, Math.floor(damage / 2));

/** Puntos de golpe más los temporales de una hoja (para saber cuánto daño ha recibido entre dos versiones). */
export function hpPoolOf(template: SheetTemplate, values: SheetValues): { hp: number; pool: number } | null {
  const combat = combatOf(template);
  const keys = new Set(allFields(template).map((f) => f.key));
  if (!combat?.hp || !keys.has(combat.hp)) return null;
  const n = (k: string | undefined) => (k && keys.has(k) ? Number(values[k]) || 0 : 0);
  const hp = n(combat.hp);
  return { hp, pool: hp + n(combat.hpTemp) };
}
