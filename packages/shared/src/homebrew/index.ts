import { evaluate, type DiceRoll } from '../expr.js';
import type { ChatRollPart } from '../schemas/chat.js';
import {
  AREA_SHAPE_LABELS,
  ATTACK_KIND_LABELS,
  homebrewDataSchema,
  type CreateHomebrewInput,
  type HomebrewData,
  type HomebrewEntry,
  type HomebrewKind,
} from '../schemas/homebrew.js';
import { allFields, createResolver, type SheetRow, type SheetTemplate, type SheetValues } from '../schemas/sheet.js';
import type { SrdItem, SrdSpell } from '../srd/types.js';
import { actionsOf, saveOptions, type SheetActions } from '../systems/actions.js';

/** Valores de una creación nueva: los hechizos ya traen el ataque y la CD de conjuro de la plantilla. */
export function blankHomebrew(kind: HomebrewKind, template?: SheetTemplate | null): HomebrewData {
  const a = template ? actionsOf(template) : null;
  const ref = (v: string | undefined) => (v ? (/^[a-z_][a-z0-9_]*$/i.test(v) ? `@{${v}}` : v) : '');
  const base = homebrewDataSchema.parse({});
  if (kind === 'spell') return { ...base, level: 1, attackBonus: ref(a?.spellAttack), saveDc: ref(a?.spellDc), castTime: '1 acción', duration: 'Instantánea' };
  if (kind === 'attack') return { ...base, attack: 'melee', damage: [{ dice: '1d6', type: '' }] };
  return { ...base, level: 0, category: 'objeto maravilloso' };
}

const isNumber = (v: string) => /^[+-]?\d+(\.\d+)?$/.test(v.trim());
const signed = (v: string) => (isNumber(v) && !/^[+-]/.test(v.trim()) ? `+${v.trim()}` : v.trim());

/** Valor de una fórmula con la hoja (sin dados); null si no se puede calcular. */
export function formulaValue(expr: string, resolve: (name: string) => unknown): number | null {
  if (!expr.trim()) return null;
  try {
    const v = evaluate(expr, { resolve }).value;
    return Number.isFinite(v) ? Math.round(v) : null;
  } catch {
    return null;
  }
}

/** Primer daño (o curación) con los dados de mejora sumados `steps` veces. */
export function upcastExpression(base: string, upcast: string, steps: number): string {
  if (!upcast.trim() || steps <= 0) return base;
  const n = Math.min(9, steps);
  const dice = /^\s*(\d*)[dD](\d+)\s*$/.exec(upcast);
  if (dice) {
    // "1d6" por nivel: si el daño empieza por d6, se suman al mismo grupo ("8d6" → "10d6").
    const per = dice[1] === '' ? 1 : Number(dice[1]);
    const lead = new RegExp(`^\\s*(\\d*)[dD]${dice[2]}(?![0-9])`).exec(base);
    if (lead) return base.replace(lead[0], `${(lead[1] === '' ? 1 : Number(lead[1])) + per * n}d${dice[2]}`);
    return `${base} + ${per * n}d${dice[2]}`;
  }
  return `${base}${` + (${upcast})`.repeat(n)}`;
}

const keptSum = (rolls: DiceRoll[]) => rolls.reduce((sum, r) => sum + r.kept.reduce((s, i) => s + (r.results[i] ?? 0), 0), 0);

export interface HomebrewRoll {
  /** Tirada de ataque, si tiene. */
  attack: (ChatRollPart & { natural: number | null; crit: boolean }) | null;
  /** Daños (uno por tipo) y curación. */
  parts: ChatRollPart[];
  damage: number;
  damageTypes: string[];
  heal: number;
  /** CD de la salvación ya calculada. */
  dc: number | null;
}

/**
 * Tira una creación con los valores de la hoja: ataque (con crítico, que dobla los dados del
 * daño), daños por tipo, curación y CD, con la mejora por nivel de espacio si se lanza más alto.
 * La llama el servidor con su generador de números (las tiradas nunca se hacen en el cliente).
 */
export function rollHomebrew(d: HomebrewData, opts: { resolve: (name: string) => unknown; rng: () => number; castLevel?: number; kind?: HomebrewKind }): HomebrewRoll {
  const { resolve, rng } = opts;
  const steps = opts.kind === 'spell' && d.level > 0 && opts.castLevel ? opts.castLevel - d.level : 0;
  let attack: HomebrewRoll['attack'] = null;
  if (d.attack !== 'none' && d.attackBonus.trim()) {
    const expression = `1d20 + ${isNumber(d.attackBonus) ? Number(d.attackBonus) : `(${d.attackBonus})`}`;
    const r = evaluate(expression, { resolve, rng });
    const d20 = r.rolls.find((x) => x.sides === 20);
    const natural = d20 ? (d20.results[d20.kept[0] ?? 0] ?? null) : null;
    attack = { label: ATTACK_KIND_LABELS[d.attack], expression: `1d20 + ${d.attackBonus}`, total: Math.round(r.value), rolls: r.rolls, natural, crit: natural !== null && natural >= d.critFrom };
  }
  const crit = !!attack?.crit;
  const rollPart = (expression: string, label: string, double: boolean): ChatRollPart => {
    const first = evaluate(expression, { resolve, rng });
    let total = first.value;
    let rolls = first.rolls;
    if (double && first.rolls.length) {
      const again = evaluate(expression, { resolve, rng });
      total += keptSum(again.rolls);
      rolls = [...rolls, ...again.rolls];
    }
    return { label, expression, total: Math.max(0, Math.round(total)), rolls };
  };
  const parts: ChatRollPart[] = [];
  let damage = 0;
  const damageTypes: string[] = [];
  d.damage.forEach((p, i) => {
    if (!p.dice.trim()) return;
    const expression = i === 0 ? upcastExpression(p.dice, d.upcast, steps) : p.dice;
    const part = rollPart(expression, `Daño${p.type ? ` de ${p.type}` : ''}${crit ? ' ×2 dados' : ''}`, crit);
    parts.push(part);
    damage += part.total;
    if (p.type && !damageTypes.includes(p.type)) damageTypes.push(p.type);
  });
  let heal = 0;
  if (d.heal.trim()) {
    const hasDamage = d.damage.some((p) => p.dice.trim());
    const part = rollPart(hasDamage ? d.heal : upcastExpression(d.heal, d.upcast, steps), 'Curación', false);
    parts.push(part);
    heal = part.total;
  }
  const dc = d.save ? formulaValue(d.saveDc, resolve) : null;
  return { attack, parts, damage, damageTypes, heal, dc };
}

export type NewSheetRow = Omit<SheetRow, '_id'>;

/** Fila nueva de una tabla de la hoja con los valores por defecto de sus columnas. */
function rowFor(template: SheetTemplate, list: string, set: Record<string, string | number | boolean | undefined>): NewSheetRow {
  const cols = allFields(template).find((f) => f.key === list)?.columns ?? [];
  const row: NewSheetRow = {};
  for (const c of cols) if (c.type !== 'computed') row[c.key] = c.default ?? (c.type === 'number' ? 0 : c.type === 'checkbox' ? false : '');
  for (const [k, v] of Object.entries(set)) if (v !== undefined && cols.some((c) => c.key === k)) row[k] = v;
  return row;
}

/** Texto de daño para las columnas de la hoja: "8d6 fuego". */
const damageText = (d: HomebrewData) => {
  const p = d.damage.find((x) => x.dice.trim());
  if (p) return `${p.dice} ${p.type}`.trim();
  return d.heal.trim() ? `${d.heal} curación` : '';
};

/**
 * Filas que añade una creación a una hoja, enlazadas con `_ref`: hechizos a la tabla de conjuros,
 * ataques (y objetos con daño) a la de ataques, objetos al inventario y, si tiene usos, una fila de
 * recursos que se recarga al descansar. Lo que la plantilla no tenga se salta.
 */
export function homebrewRows(template: SheetTemplate, entry: Pick<HomebrewEntry, 'id' | 'kind' | 'name' | 'data'>, values?: SheetValues): { list: string; row: NewSheetRow }[] {
  const a = actionsOf(template);
  const d = entry.data;
  const out: { list: string; row: NewSheetRow }[] = [];
  const add = (list: string, set: Record<string, string | number | boolean | undefined>) => out.push({ list, row: { ...rowFor(template, list, set), _ref: entry.id } });
  const resolve = values ? createResolver(template, values) : () => undefined;
  const save = d.save ? saveOptions(template).find((s) => s.value === d.save) : undefined;
  const dc = d.save ? (formulaValue(d.saveDc, resolve) ?? d.saveDc) : '';

  const wantsAttackRow = entry.kind === 'attack' || (entry.kind === 'item' && (d.attack !== 'none' || d.damage.some((p) => p.dice.trim()))) || (entry.kind === 'spell' && !a.spells);
  if (entry.kind === 'spell' && a.spells) add(a.spells.list, { [a.spells.name]: entry.name, [a.spells.level]: d.level, [a.spells.effect]: damageText(d) });
  if (wantsAttackRow && a.attacks) {
    const bonus = d.attack !== 'none' && d.attackBonus ? signed(d.attackBonus) : d.save ? `CD ${dc} ${(save?.label ?? d.save).slice(0, 3).toUpperCase()}` : '';
    const rest = d.damage.filter((p) => p.dice.trim()).slice(1);
    add(a.attacks.list, {
      [a.attacks.name]: entry.name,
      [a.attacks.attack]: bonus,
      [a.attacks.damage]: damageText(d),
      ...(a.attacks.extra ? { [a.attacks.extra]: rest.length ? `${rest[0]!.dice} ${rest[0]!.type}`.trim() : '' } : {}),
      ...(a.attacks.crit ? { [a.attacks.crit]: d.critFrom } : {}),
    });
  }
  if (entry.kind === 'item' && a.inventory) add(a.inventory.list, { [a.inventory.name]: entry.name, [a.inventory.qty]: 1, ...(a.inventory.weight ? { [a.inventory.weight]: d.weight } : {}) });
  if (d.uses > 0 && a.resources) add(a.resources.list, { [a.resources.name]: entry.name, [a.resources.uses]: d.uses, [a.resources.max]: d.uses, [a.resources.recharge]: d.recharge });
  return out;
}

/** Resumen de una línea: "Nivel 3 · Salvación de Destreza CD 15 (mitad) · 8d6 fuego · Esfera de 20 pies". */
export function homebrewSummary(entry: Pick<HomebrewEntry, 'kind' | 'data'>, opts: { saveLabel?: string; statusLabel?: (id: string) => string; unit?: string } = {}): string {
  const d = entry.data;
  const parts: string[] = [];
  if (entry.kind === 'spell') parts.push(d.level ? `Nivel ${d.level}${d.school ? ` de ${d.school.toLowerCase()}` : ''}` : `Truco${d.school ? ` de ${d.school.toLowerCase()}` : ''}`);
  if (entry.kind === 'item') parts.push([d.category, d.rarity].filter(Boolean).join(', ') || 'Objeto');
  if (d.attack !== 'none') parts.push(`${ATTACK_KIND_LABELS[d.attack]} ${d.attackBonus ? signed(d.attackBonus) : ''}`.trim());
  if (d.save) parts.push(`Salvación de ${opts.saveLabel ?? d.save} CD ${d.saveDc || '?'}${d.saveHalf && d.damage.length ? ' (mitad)' : ''}`);
  const dmg = d.damage.filter((p) => p.dice.trim()).map((p) => `${p.dice} ${p.type}`.trim());
  if (dmg.length) parts.push(dmg.join(' + '));
  if (d.heal.trim()) parts.push(`Cura ${d.heal}`);
  if (d.upcast.trim() && entry.kind === 'spell' && d.level > 0) parts.push(`+${d.upcast} por nivel superior`);
  if (d.area.shape !== 'none' && d.area.size > 0) parts.push(`${AREA_SHAPE_LABELS[d.area.shape].split(' (')[0]} de ${d.area.size} ${opts.unit ?? 'pies'}`);
  if (d.conditions.length) parts.push(d.conditions.map((c) => opts.statusLabel?.(c) ?? c).join(', '));
  if (d.concentration) parts.push('concentración');
  if (d.uses > 0) parts.push(`${d.uses} uso${d.uses > 1 ? 's' : ''}${d.recharge ? ` (descanso ${d.recharge})` : ''}`);
  if (d.consumable) parts.push('consumible');
  return parts.join(' · ');
}

// ---------- Copiar del SRD ----------

const DICE = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/;

/** Diferencia entre dos tiradas sencillas ("8d6" y "9d6" → "1d6"). */
function diceStep(a: string | undefined, b: string | undefined): string {
  const x = a && DICE.exec(a.replace(/\s*\+\s*MOD/, ''));
  const y = b && DICE.exec(b.replace(/\s*\+\s*MOD/, ''));
  if (!x || !y || x[2] !== y[2] || Number(y[1]) <= Number(x[1])) return '';
  return `${Number(y[1]) - Number(x[1])}d${x[2]}`;
}

/** "esfera de 20 pies" → círculo de 20. */
export function parseSrdArea(area: string | undefined): HomebrewData['area'] {
  const m = area && /^(\S+) de (\d+)/.exec(area);
  if (!m) return { shape: 'none', size: 0 };
  const shape = ({ esfera: 'circle', cilindro: 'circle', cono: 'cone', línea: 'line', cubo: 'square' } as const)[m[1] as 'esfera'];
  return shape ? { shape, size: Number(m[2]) } : { shape: 'none', size: 0 };
}

/** Creación a partir de un conjuro del SRD, lista para retocar. */
export function homebrewFromSrdSpell(s: SrdSpell, actions?: Pick<SheetActions, 'spellAttack' | 'spellDc' | 'spellMod'> | null): CreateHomebrewInput {
  const ref = (v: string | undefined) => (v ? (/^[a-z_][a-z0-9_]*$/i.test(v) ? `@{${v}}` : v) : '');
  const lowest = (byKey?: Record<string, string>) => {
    if (!byKey) return { base: '', next: '' };
    const keys = Object.keys(byKey).sort((a, b) => Number(a) - Number(b));
    return { base: byKey[keys[0]!] ?? '', next: byKey[keys[1]!] ?? '' };
  };
  const mod = ref(actions?.spellMod);
  const damage = (s.damage ?? []).map((d) => ({ dice: lowest(d.bySlot ?? d.byLevel).base, type: d.type }));
  const firstDamage = s.damage?.[0];
  const heal = lowest(s.heal);
  const healExpr = heal.base.replace(/\s*\+\s*MOD/, mod ? ` + ${mod}` : '');
  return {
    kind: 'spell',
    name: s.name,
    data: {
      description: [s.desc, s.higher].filter(Boolean).join('\n\n'),
      level: s.level,
      school: s.school,
      castTime: s.time,
      range: s.range,
      components: s.components,
      duration: s.duration,
      concentration: s.concentration,
      ritual: s.ritual,
      attack: s.attack ?? 'none',
      attackBonus: s.attack ? ref(actions?.spellAttack) : '',
      save: s.save ?? '',
      saveDc: s.save ? ref(actions?.spellDc) : '',
      saveHalf: !!s.save && !!s.damage && /half/i.test(s.desc),
      damage,
      heal: healExpr,
      // Los trucos mejoran con el nivel del personaje (no con el espacio): eso no se suma solo.
      upcast: s.level > 0 ? (firstDamage?.bySlot ? diceStep(lowest(firstDamage.bySlot).base, lowest(firstDamage.bySlot).next) : diceStep(heal.base, heal.next)) : '',
      area: parseSrdArea(s.area),
      selfStatus: s.concentration ? 'concentracion' : '',
    },
  };
}

/**
 * Creación a partir de un objeto del SRD (las armas, con su ataque). Con la plantilla de 5e, el
 * bono de ataque y el daño usan la competencia y la Fuerza o la Destreza de quien la lleve.
 */
export function homebrewFromSrdItem(it: SrdItem, template?: SheetTemplate | null): CreateHomebrewInput {
  const w = it.weapon;
  const keys = new Set(template ? allFields(template).map((f) => f.key) : []);
  const ability = w ? (w.finesse ? 'max(@{fue_mod}, @{des_mod})' : w.ranged ? '@{des_mod}' : '@{fue_mod}') : '';
  const known = keys.has('competencia') && keys.has('fue_mod') && keys.has('des_mod');
  const extra = w ? [w.twoHanded ? `${w.twoHanded} a dos manos` : '', w.range ? `alcance ${w.range} pies` : '', ...w.props].filter(Boolean).join(', ') : '';
  return {
    kind: 'item',
    name: it.name,
    data: {
      description: [extra, it.desc].filter(Boolean).join('\n\n'),
      level: 0,
      category: it.cat,
      rarity: it.rarity ?? '',
      weight: it.weight ?? 0,
      cost: it.cost ?? '',
      consumable: it.cat === 'poción' || it.cat === 'pergamino' || it.cat === 'munición',
      attack: w ? (w.ranged ? 'ranged' : 'melee') : 'none',
      // Bono a mano: depende de la Fuerza o la Destreza de quien la lleve.
      attackBonus: w ? (known ? `@{competencia} + ${ability}` : '+0') : '',
      damage: w ? [{ dice: known ? `${w.damage} + ${ability}` : w.damage, type: w.type }] : [],
      range: w?.range ? `${w.range} pies` : '',
    },
  };
}
