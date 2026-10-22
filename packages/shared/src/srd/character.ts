import { allFields, type SheetTemplate, type SheetValues } from '../schemas/sheet.js';
import { SRD_ABILITIES, type SrdAbility, type SrdClass, type SrdData, type SrdGear, type SrdItem, type SrdRace, type SrdSpell, type SrdSubrace } from './types.js';

/** Elecciones del creador de personajes. Todo es por id del SRD; la hoja se rellena con `srdCharacterValues`. */
export interface SrdBuild {
  raceId: string;
  subraceId?: string;
  classId: string;
  subclassId?: string;
  level: number;
  /** Puntuaciones antes de los bonos de especie. */
  abilities: Record<SrdAbility, number>;
  /** Características elegidas para el bono a repartir (semielfo). */
  bonusChoice: SrdAbility[];
  /** Id del trasfondo, o '' para uno propio. */
  backgroundId: string;
  /** Nombre del trasfondo propio. */
  backgroundName?: string;
  /** Habilidades elegidas (clase, especie y trasfondo propio), con las claves de la hoja. */
  skills: string[];
  /** Objetos finales (las elecciones de equipo ya resueltas). Los paquetes se abren al crear la hoja. */
  items: { id: string; qty: number }[];
  /** Conjuros y trucos elegidos. */
  spells: string[];
  /** Opción elegida en los rasgos con opciones, por nombre del rasgo. */
  options: Record<string, string>;
  languages: string[];
  alignment?: string;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

/** Puntos gastados en la compra por puntos (null si alguna puntuación está fuera de 8-15). */
export function pointBuyCost(scores: number[]): number | null {
  let total = 0;
  for (const s of scores) {
    const c = POINT_COST[s];
    if (c === undefined) return null;
    total += c;
  }
  return total;
}

/** 4d6 quitando el más bajo. */
export function roll4d6(rng: () => number = Math.random): { total: number; dice: number[] } {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(rng() * 6));
  const sorted = [...dice].sort((a, b) => a - b);
  return { total: sorted[1]! + sorted[2]! + sorted[3]!, dice };
}

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const withMod = (dice: string, mod: number) => (mod ? `${dice} ${mod > 0 ? '+' : '-'} ${Math.abs(mod)}` : dice);

/** Busca por id en las listas del SRD. */
export function srdIndex(data: SrdData) {
  const items = new Map(data.items.map((i) => [i.id, i]));
  const spells = new Map(data.spells.map((s) => [s.id, s]));
  return {
    item: (id: string) => items.get(id),
    spell: (id: string) => spells.get(id),
    race: (id: string) => data.races.find((r) => r.id === id),
    cls: (id: string) => data.classes.find((c) => c.id === id),
    background: (id: string) => data.backgrounds.find((b) => b.id === id),
  };
}

/** Puntuaciones finales con los bonos de especie, subespecie y los elegidos. */
export function finalAbilities(build: Pick<SrdBuild, 'abilities' | 'bonusChoice'>, race?: SrdRace, sub?: SrdSubrace): Record<SrdAbility, number> {
  const out = { ...build.abilities };
  for (const a of SRD_ABILITIES) out[a] += (race?.bonuses[a] ?? 0) + (sub?.bonuses[a] ?? 0);
  if (race?.bonusChoice) for (const a of build.bonusChoice.slice(0, race.bonusChoice.choose)) out[a] += race.bonusChoice.amount;
  return out;
}

/** Cuántos trucos y conjuros elige la clase a ese nivel, y el nivel de conjuro más alto. */
export function spellLimits(cls: SrdClass, level: number, mod: number): { cantrips: number; spells: number; maxLevel: number } {
  const sc = cls.spellcasting;
  const row = sc?.levels[Math.min(Math.max(level, 1), 20) - 1];
  if (!sc || !row) return { cantrips: 0, spells: 0, maxLevel: 0 };
  const maxLevel = row.slots.reduce((m, n, i) => (n > 0 ? i + 1 : m), 0);
  let spells: number;
  if (row.known !== undefined) spells = row.known;
  else if (cls.id === 'wizard') spells = 6 + 2 * (level - 1); // libro de conjuros
  else if (cls.id === 'paladin') spells = maxLevel ? Math.max(1, mod + Math.floor(level / 2)) : 0;
  else spells = Math.max(1, mod + level);
  return { cantrips: row.cantrips, spells: maxLevel ? spells : 0, maxLevel };
}

/** Objetos de un lote de equipo; las categorías se resuelven con `picks` (ids elegidos). */
export function resolveGear(gear: SrdGear[], picks: string[][] = []): { id: string; qty: number }[] {
  let p = 0;
  return gear.flatMap((g) => {
    if ('id' in g) return [g];
    const chosen = picks[p++] ?? [];
    return chosen.slice(0, g.choose).map((id) => ({ id, qty: 1 }));
  });
}

/** Junta cantidades del mismo objeto y abre los paquetes de equipo. */
export function expandItems(items: { id: string; qty: number }[], data: SrdData) {
  const idx = srdIndex(data);
  const out = new Map<string, number>();
  const add = (id: string, qty: number) => {
    const it = idx.item(id);
    if (it?.contents) for (const [c, n] of it.contents) add(c, n * qty);
    else out.set(id, (out.get(id) ?? 0) + qty);
  };
  for (const i of items) add(i.id, i.qty);
  return [...out].map(([id, qty]) => ({ id, qty, item: idx.item(id) }));
}

/** Clase de armadura con lo que lleva (la mejor armadura y escudo), o sin armadura según la clase. */
export function armorClass(items: (SrdItem | undefined)[], scores: Record<SrdAbility, number>, cls?: SrdClass, subclassId?: string): number {
  const dex = abilityMod(scores.des);
  const shield = items.some((i) => i?.armor?.kind === 'escudo') ? 2 : 0;
  const armors = items.filter((i) => i?.armor && i.armor.kind !== 'escudo').map((i) => i!.armor!);
  let base = 10 + dex;
  if (cls?.id === 'barbarian') base = 10 + dex + abilityMod(scores.con);
  else if (cls?.id === 'monk' && !shield) base = 10 + dex + abilityMod(scores.sab);
  else if (subclassId === 'draconic') base = 13 + dex;
  for (const a of armors) {
    const ac = a.base + (a.dex ? (a.maxDex !== undefined ? Math.min(dex, a.maxDex) : dex) : 0);
    if (ac > base) base = ac;
  }
  return base + shield;
}

/** Fila de la lista de ataques para un arma. */
export function weaponAttack(item: SrdItem, scores: Record<SrdAbility, number>, level: number) {
  const w = item.weapon!;
  const str = abilityMod(scores.fue);
  const dex = abilityMod(scores.des);
  const mod = w.finesse ? Math.max(str, dex) : w.ranged ? dex : str;
  const extra = [w.twoHanded ? `${w.twoHanded} a dos manos` : '', w.range ? `${w.range} pies` : ''].filter(Boolean).join(', ');
  return { nombre: item.name, bono: signed(proficiencyBonus(level) + mod), dano: withMod(w.damage, mod), tipo: extra ? `${w.type}, ${extra}` : w.type };
}

/** Dados de daño (o curación) de un conjuro al nivel más bajo en que se lanza. */
export function spellEffect(s: SrdSpell, level: number, mod: number): string {
  if (s.heal) {
    const first = Object.keys(s.heal).sort((a, b) => Number(a) - Number(b))[0]!;
    return s.heal[first]!.replace(/\s*\+\s*MOD/, mod ? ` ${mod > 0 ? '+' : '-'} ${Math.abs(mod)}` : '');
  }
  const d = s.damage?.[0];
  if (!d) return '';
  if (d.byLevel) {
    const key = Object.keys(d.byLevel).filter((k) => Number(k) <= level).sort((a, b) => Number(b) - Number(a))[0];
    return key ? d.byLevel[key]! : '';
  }
  if (d.bySlot) return d.bySlot[String(s.level)] ?? Object.values(d.bySlot)[0] ?? '';
  return '';
}

const SAVE_ABBR: Record<SrdAbility, string> = { fue: 'FUE', des: 'DES', con: 'CON', int: 'INT', sab: 'SAB', car: 'CAR' };

/** Resumen corto de un conjuro para la columna de notas. */
export function spellNotes(s: SrdSpell): string {
  return [
    s.time,
    s.range,
    s.area,
    s.attack ? 'ataque de conjuro' : '',
    s.save ? `salv. ${SAVE_ABBR[s.save]}` : '',
    s.damage?.map((d) => d.type).filter(Boolean).join('/'),
    s.concentration ? 'concentración' : '',
    s.ritual ? 'ritual' : '',
    s.duration !== 'Instantánea' ? s.duration : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** PG máximos con la media de los dados de golpe (el máximo al nivel 1). */
export function hitPoints(cls: SrdClass, level: number, con: number, subraceId?: string): number {
  const conMod = abilityMod(con);
  let hp = cls.hitDie + conMod;
  for (let l = 2; l <= level; l++) hp += Math.max(1, cls.hitDie / 2 + 1 + conMod);
  if (subraceId === 'hill-dwarf') hp += level; // Dureza enana
  return Math.max(1, hp);
}

/**
 * Valores de la hoja para un personaje creado con el SRD. Como con los monstruos,
 * los campos que la plantilla no tenga se ignoran, así que vale aunque el DM la haya cambiado.
 */
export function srdCharacterValues(template: SheetTemplate, build: SrdBuild, data: SrdData): SheetValues {
  const idx = srdIndex(data);
  const race = idx.race(build.raceId);
  const sub = race?.subraces.find((s) => s.id === build.subraceId);
  const cls = idx.cls(build.classId);
  const subclass = cls?.subclasses.find((s) => s.id === build.subclassId && s.level <= build.level);
  const bg = idx.background(build.backgroundId);
  const level = Math.min(20, Math.max(1, Math.round(build.level)));
  const scores = finalAbilities(build, race, sub);

  const fields = allFields(template);
  const keys = new Set(fields.map((f) => f.key));
  const out: SheetValues = {};
  const put = (key: string, value: SheetValues[string]) => {
    if (keys.has(key)) out[key] = value;
  };
  const listHas = (list: string, col: string) => fields.some((f) => f.key === list && f.columns?.some((c) => c.key === col));

  for (const a of SRD_ABILITIES) put(a, scores[a]);
  put('clase', cls ? (subclass ? `${cls.name} (${subclass.name})` : cls.name) : '');
  put('nivel', level);
  put('raza', sub?.name ?? race?.name ?? '');
  put('trasfondo', bg?.name ?? build.backgroundName ?? '');
  if (build.alignment) put('alineamiento', build.alignment);
  put('velocidad', race?.speed ?? 30);

  if (cls) {
    const hp = hitPoints(cls, level, scores.con, sub?.id);
    put('pg_max', hp);
    put('pg_actuales', hp);
    put('dados_golpe', `1d${cls.hitDie}`);
    for (const a of cls.saves) put(`sv_${a}_comp`, true);
  }
  const skills = new Set([...(race?.skills ?? []), ...(sub?.skills ?? []), ...(bg?.skills ?? []), ...build.skills]);
  for (const s of skills) put(`${s}_comp`, true);

  // Equipo: armas a la lista de ataques, todo al inventario y la CA con la mejor armadura.
  const inventory = expandItems(build.items, data);
  const carried = build.items.map((i) => idx.item(i.id));
  // Estilo de combate "Defensa": +1 a la CA con armadura.
  const defense = Object.values(build.options).includes('Defensa') && carried.some((i) => i?.armor && i.armor.kind !== 'escudo');
  put('ca', armorClass(carried, scores, cls, subclass?.id) + (defense ? 1 : 0));
  const attacks: Record<string, string | number | boolean>[] = [];
  const seenWeapons = new Set<string>();
  for (const it of carried) {
    if (!it?.weapon || seenWeapons.has(it.id)) continue;
    seenWeapons.add(it.id);
    attacks.push(weaponAttack(it, scores, level));
  }

  // Conjuros: trucos de ataque también a la lista de ataques.
  const sc = cls?.spellcasting;
  const spellMod = sc ? abilityMod(scores[sc.ability]) : 0;
  const spells = build.spells.map((id) => idx.spell(id)).filter((s): s is SrdSpell => !!s).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  for (const s of spells) {
    if (s.level !== 0 || !s.damage) continue;
    const dmg = spellEffect(s, level, spellMod);
    attacks.push({
      nombre: s.name,
      bono: s.attack ? signed(proficiencyBonus(level) + spellMod) : `CD ${8 + proficiencyBonus(level) + spellMod} ${s.save ? SAVE_ABBR[s.save] : ''}`.trim(),
      dano: dmg,
      tipo: [s.damage.map((d) => d.type).join('/'), s.range].filter(Boolean).join(', '),
    });
  }
  if (keys.has('ataques')) {
    const hasType = listHas('ataques', 'tipo');
    out.ataques = attacks.map((a, i) => {
      const { tipo, ...rest } = a;
      return { _id: `a${i}`, ...rest, ...(hasType ? { tipo } : {}) };
    });
  }
  if (keys.has('conjuros')) {
    out.conjuros = spells.map((s, i) => ({ _id: `c${i}`, nivel: s.level, nombre: s.name, preparado: true, efecto: spellEffect(s, level, spellMod), notas: spellNotes(s) }));
  }
  if (sc) {
    put('conj_caracteristica', sc.ability);
    const slots = sc.levels[level - 1]?.slots ?? [];
    slots.forEach((n, i) => put(`espacios_${i + 1}_max`, n));
  }
  if (keys.has('inventario')) {
    out.inventario = inventory.map(({ id, qty, item }, i) => ({ _id: `i${i}`, objeto: item?.name ?? id, cantidad: qty, peso: item?.weight ?? 0 }));
  }
  if (bg?.gold) put('po', bg.gold);

  // Competencias, idiomas y rasgos como texto.
  const profs = [...(cls?.proficiencies ?? []), ...(race?.proficiencies ?? []), ...(sub?.proficiencies ?? [])];
  const languages = [...new Set([...(race?.languages ?? []), ...build.languages])];
  put('competencias', [profs.length ? `Competencias: ${profs.join(', ')}.` : '', languages.length ? `Idiomas: ${languages.join(', ')}.` : ''].filter(Boolean).join('\n'));
  const pick = (name: string, options?: { name: string }[]) => {
    const chosen = options?.length ? build.options[name] : undefined;
    if (!chosen) return name;
    return chosen.startsWith(name) ? chosen : `${name}: ${chosen}`;
  };
  const lines: string[] = [];
  const raceTraits = [...(race?.traits ?? []), ...(sub?.traits ?? [])];
  if (raceTraits.length) lines.push(`${sub?.name ?? race?.name}: ${raceTraits.map((t) => pick(t.name, t.options)).join(', ')}.`);
  if (cls) {
    const feats = [...cls.features, ...(subclass?.features ?? [])].filter((f) => f.level <= level).sort((a, b) => a.level - b.level);
    for (const f of feats) lines.push(`Nv ${f.level} · ${pick(f.name, f.options)}`);
  }
  if (bg) lines.push(`${bg.name}: ${bg.feature.name}.`);
  lines.push('SRD 5.1 (CC-BY-4.0): las descripciones completas están en 📚 Reglas (pestaña Personajes).');
  put('rasgos', lines.join('\n'));
  return out;
}

/** Comprueba que una tirada de puntuaciones es válida para el método elegido. */
export function validScores(method: 'array' | 'pointbuy' | 'roll' | 'manual', scores: number[]): boolean {
  if (scores.length !== 6 || scores.some((s) => !Number.isInteger(s) || s < 1 || s > 30)) return false;
  if (method === 'array') return [...scores].sort((a, b) => b - a).join() === STANDARD_ARRAY.join();
  if (method === 'pointbuy') {
    const cost = pointBuyCost(scores);
    return cost !== null && cost <= POINT_BUY_BUDGET;
  }
  return true;
}
