import { allFields, computeAll, createResolver, type CombatMapping, type SheetRow, type SheetTemplate, type SheetValues } from '../schemas/sheet.js';
import { evaluate } from '../expr.js';
import { BUILTIN_TEMPLATES, combatOf } from './index.js';

/**
 * Botones de acción de la hoja: atacar, lanzar conjuros gastando espacios, gastar usos de
 * recursos y descansar. Todo sale de la plantilla (combat), así que vale para cualquier sistema
 * que tenga esas tablas; las partidas con una plantilla de antes usan lo de la 5e de serie si
 * sus campos existen.
 */
export interface SheetActions {
  attacks: NonNullable<CombatMapping['attacks']> | null;
  spells: NonNullable<CombatMapping['spells']> | null;
  slots: NonNullable<CombatMapping['slots']> | null;
  resources: NonNullable<CombatMapping['resources']> | null;
  inventory: NonNullable<CombatMapping['inventory']> | null;
  /** Patrón de los campos de salvación ("sv_{a}") o '' si la hoja no tiene. */
  saves: string;
  spellAttack: string;
  spellDc: string;
  spellMod: string;
  hp: string;
  hpMax: string;
  hpTemp: string;
}

export const slotKey = (pattern: string, level: number) => pattern.replace('{n}', String(level));

export function actionsOf(template: SheetTemplate): SheetActions {
  const combat = combatOf(template);
  const fields = allFields(template);
  const keys = new Set(fields.map((f) => f.key));
  const listHas = (list: string, cols: string[]) => {
    const f = fields.find((x) => x.key === list && x.type === 'list');
    return !!f && cols.every((c) => f.columns?.some((x) => x.key === c));
  };
  const builtin = BUILTIN_TEMPLATES.dnd5e!.template.combat!;
  const pick = <K extends 'spells' | 'slots' | 'resources' | 'inventory'>(k: K, ok: (v: NonNullable<CombatMapping[K]>) => boolean): NonNullable<CombatMapping[K]> | null => {
    const own = combat?.[k];
    if (own !== undefined) return own && ok(own as NonNullable<CombatMapping[K]>) ? (own as NonNullable<CombatMapping[K]>) : null;
    const b = builtin[k] as NonNullable<CombatMapping[K]> | null | undefined;
    return b && ok(b) ? b : null;
  };
  const attacks = combat?.attacks && listHas(combat.attacks.list, [combat.attacks.name]) ? combat.attacks : null;
  /** Texto de la plantilla o, si no lo trae, el de serie cuando sus campos existen. */
  const formula = (k: 'saves' | 'spellAttack' | 'spellDc' | 'spellMod', ok: (v: string) => boolean) => {
    const v = combat?.[k] ?? builtin[k] ?? '';
    return v && ok(v) ? v : '';
  };
  return {
    attacks: attacks && {
      ...attacks,
      extra: attacks.extra && listHas(attacks.list, [attacks.extra]) ? attacks.extra : undefined,
      crit: attacks.crit && listHas(attacks.list, [attacks.crit]) ? attacks.crit : undefined,
    },
    spells: pick('spells', (s) => listHas(s.list, [s.name, s.level])),
    slots: pick('slots', (s) => keys.has(slotKey(s.max, 1)) && keys.has(slotKey(s.used, 1))),
    resources: pick('resources', (r) => listHas(r.list, [r.name, r.uses, r.max])),
    inventory: pick('inventory', (i) => listHas(i.list, [i.name, i.qty])),
    saves: formula('saves', (v) => fields.some((f) => saveFieldPattern(v).test(f.key) && (f.type === 'computed' || !!f.roll))),
    spellAttack: formula('spellAttack', (v) => !/^[a-z_][a-z0-9_]*$/i.test(v) || keys.has(v)),
    spellDc: formula('spellDc', (v) => !/^[a-z_][a-z0-9_]*$/i.test(v) || keys.has(v)),
    spellMod: formula('spellMod', (v) => !/^[a-z_][a-z0-9_]*$/i.test(v) || keys.has(v)),
    hp: combat?.hp && keys.has(combat.hp) ? combat.hp : '',
    hpMax: combat?.hpMax ?? '',
    hpTemp: combat?.hpTemp && keys.has(combat.hpTemp) ? combat.hpTemp : '',
  };
}

/** Expresión regular de los campos de salvación a partir del patrón ("sv_{a}" → /^sv_([a-z0-9_]+)$/). */
export function saveFieldPattern(pattern: string): RegExp {
  const [before = '', after = ''] = pattern.split('{a}');
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc(before)}([a-z0-9_]+?)${esc(after)}$`, 'i');
}

/** Salvaciones de la hoja: característica (la parte {a}), campo y nombre, en el orden de la plantilla. */
export function saveOptions(template: SheetTemplate): { value: string; key: string; label: string }[] {
  const pattern = actionsOf(template).saves;
  if (!pattern) return [];
  const re = saveFieldPattern(pattern);
  return allFields(template).flatMap((f) => {
    const m = re.exec(f.key);
    return m && (f.type === 'computed' || f.roll) ? [{ value: m[1]!, key: f.key, label: f.label }] : [];
  });
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const rowsOf = (values: SheetValues, list: string) => (Array.isArray(values[list]) ? (values[list] as SheetRow[]) : []);

/** Espacios de conjuro por nivel (1-9): máximos y gastados. Los niveles sin campos no salen. */
export function slotsOf(template: SheetTemplate, values: SheetValues): { level: number; max: number; used: number }[] {
  const a = actionsOf(template);
  if (!a.slots) return [];
  const keys = new Set(allFields(template).map((f) => f.key));
  const out: { level: number; max: number; used: number }[] = [];
  for (let level = 1; level <= 9; level++) {
    const maxKey = slotKey(a.slots.max, level);
    if (!keys.has(maxKey)) continue;
    out.push({ level, max: num(values[maxKey]), used: num(values[slotKey(a.slots.used, level)]) });
  }
  return out;
}

export class ActionError extends Error {}

/** Gasta un espacio del nivel indicado (o del más bajo libre que valga para el conjuro). */
export function spendSlot(template: SheetTemplate, values: SheetValues, spellLevel: number, slot?: number): { patch: SheetValues; slot: number; left: number; max: number } {
  const a = actionsOf(template);
  const slots = slotsOf(template, values);
  if (!a.slots || !slots.length) throw new ActionError('Esta hoja no tiene espacios de conjuro');
  const pick = slot !== undefined ? slots.find((s) => s.level === slot) : slots.find((s) => s.level >= spellLevel && s.used < s.max);
  if (!pick || pick.level < spellLevel) throw new ActionError(slot !== undefined ? `No se puede lanzar con un espacio de nivel ${slot}` : `No te quedan espacios de nivel ${spellLevel} o superior`);
  if (pick.used >= pick.max) throw new ActionError(`No te quedan espacios de nivel ${pick.level}`);
  return { patch: { [slotKey(a.slots.used, pick.level)]: pick.used + 1 }, slot: pick.level, left: pick.max - pick.used - 1, max: pick.max };
}

/** Gasta un uso de un recurso. */
export function spendUse(template: SheetTemplate, values: SheetValues, rowId: string): { patch: SheetValues; name: string; left: number; max: number } {
  const r = actionsOf(template).resources;
  if (!r) throw new ActionError('Esta hoja no tiene tabla de recursos');
  const rows = rowsOf(values, r.list);
  const row = rows.find((x) => x._id === rowId);
  if (!row) throw new ActionError('Recurso no encontrado');
  const uses = num(row[r.uses]);
  if (uses <= 0) throw new ActionError(`No te quedan usos de ${String(row[r.name] || 'ese recurso')}`);
  return {
    patch: { [r.list]: rows.map((x) => (x._id === rowId ? { ...x, [r.uses]: uses - 1 } : x)) },
    name: String(row[r.name] ?? ''),
    left: uses - 1,
    max: num(row[r.max]),
  };
}

export type RestKind = 'short' | 'long';

/**
 * Descanso: el largo recupera los PG, quita los temporales, devuelve todos los espacios y los
 * recursos de descanso corto o largo; el corto, los recursos de descanso corto y los espacios
 * de pacto. Devuelve los cambios y un resumen de lo recuperado.
 */
export function restPatch(template: SheetTemplate, values: SheetValues, kind: RestKind): { patch: SheetValues; recovered: string[] } {
  const a = actionsOf(template);
  const patch: SheetValues = {};
  const recovered: string[] = [];
  const keys = new Set(allFields(template).map((f) => f.key));
  if (kind === 'long') {
    if (a.hp && a.hpMax) {
      const max = keys.has(a.hpMax) ? num(values[a.hpMax] ?? computeAll(template, values)[a.hpMax]) : num(computeAll(template, values)[a.hpMax]);
      if (max > 0 && num(values[a.hp]) < max) {
        patch[a.hp] = max;
        recovered.push('los PG');
      }
    }
    if (a.hpTemp && num(values[a.hpTemp]) !== 0) patch[a.hpTemp] = 0;
  }
  const pact = !!(a.slots?.pact && values[a.slots.pact]);
  if (a.slots && (kind === 'long' || pact)) {
    let any = false;
    for (const s of slotsOf(template, values)) {
      if (s.used > 0) {
        patch[slotKey(a.slots.used, s.level)] = 0;
        any = true;
      }
    }
    if (any) recovered.push(pact && kind === 'short' ? 'los espacios de pacto' : 'los espacios de conjuro');
  }
  if (a.resources) {
    const r = a.resources;
    const names: string[] = [];
    const rows = rowsOf(values, r.list).map((row) => {
      const recharge = String(row[r.recharge] ?? '');
      const due = recharge === 'corto' || (kind === 'long' && recharge === 'largo');
      const max = num(row[r.max]);
      if (!due || num(row[r.uses]) >= max) return row;
      names.push(String(row[r.name] || 'recurso'));
      return { ...row, [r.uses]: max };
    });
    if (names.length) {
      patch[r.list] = rows;
      recovered.push(names.join(', '));
    }
  }
  return { patch, recovered };
}

/**
 * Daño a una hoja: se come primero los PG temporales y luego los actuales (sin bajar de 0).
 * Devuelve los cambios y cómo quedan los PG; null si la hoja no tiene PG que se puedan restar.
 */
export function damagePatch(template: SheetTemplate, values: SheetValues, amount: number): { patch: SheetValues; before: number; after: number; temp: number } | null {
  const a = actionsOf(template);
  const hpField = allFields(template).find((f) => f.key === a.hp && f.type === 'number');
  if (!hpField) return null;
  const before = num(values[a.hp]);
  let left = Math.max(0, Math.round(amount));
  const patch: SheetValues = {};
  let temp = a.hpTemp ? num(values[a.hpTemp]) : 0;
  if (a.hpTemp && temp > 0) {
    const absorbed = Math.min(temp, left);
    temp -= absorbed;
    left -= absorbed;
    patch[a.hpTemp] = temp;
  }
  const after = Math.max(0, before - left);
  if (after !== before) patch[a.hp] = after;
  return { patch, before, after, temp };
}

/** Curación: suma PG sin pasar del máximo (si la hoja tiene máximo). */
export function healPatch(template: SheetTemplate, values: SheetValues, amount: number): { patch: SheetValues; before: number; after: number } | null {
  const a = actionsOf(template);
  const hpField = allFields(template).find((f) => f.key === a.hp && f.type === 'number');
  if (!hpField) return null;
  const before = num(values[a.hp]);
  let max = Infinity;
  if (a.hpMax) {
    try {
      const m = evaluate(a.hpMax, { resolve: createResolver(template, values) }).value;
      if (Number.isFinite(m) && m > 0) max = m;
    } catch {
      /* fórmula rota: sin tope */
    }
  }
  const after = Math.max(before, Math.min(max, before + Math.max(0, Math.round(amount))));
  return { patch: after !== before ? { [a.hp]: after } : {}, before, after };
}
