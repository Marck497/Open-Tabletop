#!/usr/bin/env node
// Genera packages/shared/src/srd/data.json a partir de 5e-bits/5e-database (SRD 5.1, CC-BY-4.0; base de datos MIT).
// Uso: node scripts/srd/build.mjs [carpeta con los 5e-SRD-*.json]   (sin carpeta, los descarga de GitHub)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPELLS_ES } from './es-spells.mjs';
import { featureEs } from './es-features.mjs';
import {
  ABILITY_KEY, ARMOR_KIND, BACKGROUNDS_ES, CATEGORY_ES, CLASSES_ES, DAMAGE_ES, EQUIPMENT_ES, ITEM_CAT, LANGUAGES_ES, PROF_ES, PROPERTIES_ES, RACES_ES,
  RARITY, SCHOOLS_ES, SIZE_ES, SKILLS_KEY, SUBCLASSES_ES, SUBRACES_ES, TRAITS_ES,
} from './es-misc.mjs';

const REF = 'main';
const BASE = `https://raw.githubusercontent.com/5e-bits/5e-database/${REF}/src/2014`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../packages/shared/src/srd/data.json');
const dir = process.argv[2];

async function load(name) {
  const file = `5e-SRD-${name}.json`;
  if (dir) return JSON.parse(await readFile(join(dir, file), 'utf8'));
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  return res.json();
}

const missing = new Set();
const tr = (map, en, what) => {
  if (map[en] !== undefined) return map[en];
  missing.add(`${what}: ${en}`);
  return en;
};
const text = (d) => (Array.isArray(d) ? d.join('\n\n') : (d ?? ''));
const ability = (a) => ABILITY_KEY[a.index];
const skillOf = (profIndex) => SKILLS_KEY[profIndex.replace(/^skill-/, '')];

// ---------- Textos sueltos ----------
const UNITS = { feet: 'pies', foot: 'pie', mile: 'milla', miles: 'millas', minute: 'minuto', minutes: 'minutos', hour: 'hora', hours: 'horas', day: 'día', days: 'días', round: 'asalto' };
const unit = (s) => s.replace(/(\d+) (\w+)/, (_, n, u) => `${n} ${UNITS[u] ?? u}`);
function timeEs(t) {
  return { '1 action': '1 acción', '1 bonus action': '1 acción adicional', '1 reaction': '1 reacción' }[t] ?? unit(t);
}
function rangeEs(r) {
  return { Self: 'Personal', Touch: 'Toque', Sight: 'Vista', Special: 'Especial', Unlimited: 'Ilimitado' }[r] ?? unit(r);
}
function durationEs(d) {
  if (d === 'Instantaneous') return 'Instantánea';
  if (d === 'Until dispelled') return 'Hasta que se disipe';
  if (d === 'Special') return 'Especial';
  const up = d.match(/^Up to (.*)$/);
  return up ? `Hasta ${unit(up[1])}` : unit(d);
}
const AREA = { sphere: 'esfera', cube: 'cubo', cylinder: 'cilindro', line: 'línea', cone: 'cono' };
const COIN = { gp: 'po', sp: 'pp', cp: 'pc', ep: 'pe', pp: 'ppt' };
EQUIPMENT_ES["Thieves' Tools"] ??= 'Herramientas de ladrón';

// ---------- Conjuros ----------
function spell(s) {
  const out = {
    id: s.index,
    name: tr(SPELLS_ES, s.name, 'conjuro'),
    en: s.name,
    level: s.level,
    school: tr(SCHOOLS_ES, s.school.name, 'escuela'),
    time: timeEs(s.casting_time),
    range: rangeEs(s.range),
    components: s.components.join(', ') + (s.material ? ` (${s.material.replace(/\.$/, '')})` : ''),
    duration: durationEs(s.duration),
    concentration: s.concentration,
    ritual: s.ritual,
    classes: s.classes.map((c) => c.index),
  };
  if (s.attack_type) out.attack = s.attack_type;
  if (s.dc) out.save = ability(s.dc.dc_type);
  if (s.damage?.length) {
    out.damage = s.damage.map((d) => ({
      type: d.damage_type ? tr(DAMAGE_ES, d.damage_type.name, 'daño') : '',
      ...(d.damage_at_slot_level ? { bySlot: d.damage_at_slot_level } : {}),
      ...(d.damage_at_character_level ? { byLevel: d.damage_at_character_level } : {}),
    }));
  }
  if (s.heal_at_slot_level) out.heal = s.heal_at_slot_level;
  if (s.area_of_effect) out.area = `${AREA[s.area_of_effect.type]} de ${s.area_of_effect.size} pies`;
  out.desc = text(s.desc);
  if (s.higher_level?.length) out.higher = text(s.higher_level);
  return out;
}

// ---------- Objetos ----------
function item(e) {
  const out = { id: e.index, name: tr(EQUIPMENT_ES, e.name, 'objeto'), en: e.name, cat: ITEM_CAT[e.equipment_category.index] ?? 'equipo' };
  if (e.gear_category?.index === 'equipment-packs') out.cat = 'paquete';
  if (e.cost) out.cost = `${e.cost.quantity} ${COIN[e.cost.unit] ?? e.cost.unit}`;
  if (e.weight) out.weight = e.weight;
  if (e.damage) {
    const props = (e.properties ?? []).map((p) => tr(PROPERTIES_ES, p.name, 'propiedad'));
    const range = e.weapon_range === 'Ranged' ? e.range : e.throw_range;
    out.weapon = {
      martial: e.weapon_category === 'Martial',
      ranged: e.weapon_range === 'Ranged',
      damage: e.damage.damage_dice,
      type: tr(DAMAGE_ES, e.damage.damage_type.name, 'daño'),
      ...(e.two_handed_damage ? { twoHanded: e.two_handed_damage.damage_dice } : {}),
      ...(range ? { range: `${range.normal}${range.long ? `/${range.long}` : ''}` } : {}),
      props,
      finesse: (e.properties ?? []).some((p) => p.index === 'finesse'),
    };
  }
  if (e.armor_class) {
    out.armor = {
      kind: ARMOR_KIND[e.armor_category],
      base: e.armor_class.base,
      dex: e.armor_class.dex_bonus,
      ...(e.armor_class.max_bonus ? { maxDex: e.armor_class.max_bonus } : {}),
      ...(e.str_minimum ? { str: e.str_minimum } : {}),
      stealthDisadvantage: !!e.stealth_disadvantage,
    };
  }
  if (e.contents?.length) out.contents = e.contents.map((c) => [c.item.index, c.quantity]);
  if (e.desc?.length && !out.weapon && !out.armor) out.desc = text(e.desc);
  return out;
}

function magicItem(m) {
  const desc = [...m.desc];
  const kind = desc.shift() ?? '';
  return { id: `magic-${m.index}`, name: m.name, en: m.name, cat: ITEM_CAT[m.equipment_category.index] ?? 'objeto mágico', rarity: RARITY[m.rarity.name] ?? m.rarity.name, desc: `${kind}\n\n${text(desc)}`.trim() };
}

// ---------- Elecciones de equipo ----------
function gearOf(o) {
  switch (o.option_type) {
    case 'counted_reference':
      return [{ id: o.of.index, qty: o.count }];
    case 'multiple':
      return o.items.flatMap(gearOf);
    case 'choice':
      return choiceGear(o.choice);
    case undefined:
      if (o.equipment_category) return [{ category: o.equipment_category.index, choose: 1 }];
  }
  throw new Error(`Opción de equipo desconocida: ${JSON.stringify(o).slice(0, 200)}`);
}
function choiceGear(c) {
  if (c.from.option_set_type === 'equipment_category') return [{ category: c.from.equipment_category.index, choose: c.choose }];
  throw new Error(`Elección anidada desconocida: ${JSON.stringify(c).slice(0, 200)}`);
}
function equipChoice(c) {
  if (c.from.option_set_type === 'equipment_category') return { options: [[{ category: c.from.equipment_category.index, choose: c.choose }]] };
  return { options: c.from.options.map(gearOf) };
}

async function main() {
  const [spells, equipment, magic, categories, classes, subclasses, levels, features, races, subraces, traits, backgrounds, languages] = await Promise.all(
    ['Spells', 'Equipment', 'Magic-Items', 'Equipment-Categories', 'Classes', 'Subclasses', 'Levels', 'Features', 'Races', 'Subraces', 'Traits', 'Backgrounds', 'Languages'].map(load),
  );
  const traitBy = new Map(traits.map((t) => [t.index, t]));
  const spellsOut = spells.map(spell);
  const itemsOut = [...equipment.map(item), ...magic.filter((m) => !m.variant).map(magicItem)];

  // Categorías usadas en las elecciones.
  const usedCats = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (o.category) usedCats.add(o.category);
      Object.values(o).forEach(walk);
    }
  };

  // ---------- Clases ----------
  const featureOut = (f) => {
    const options = features.filter((x) => x.parent?.index === f.index);
    return { name: featureEs(f.name), desc: text(f.desc), level: f.level, ...(options.length ? { options: options.map((o) => ({ name: featureEs(o.name), desc: text(o.desc) })) } : {}) };
  };
  const classesOut = classes.map((c) => {
    const lv = levels.filter((l) => l.class?.index === c.index && !l.subclass).sort((a, b) => a.level - b.level);
    const skillChoice = c.proficiency_choices.find((p) => p.from.options?.some((o) => o.item?.index?.startsWith('skill-')));
    const out = {
      id: c.index,
      name: tr(CLASSES_ES, c.name, 'clase'),
      en: c.name,
      hitDie: c.hit_die,
      saves: c.saving_throws.map(ability),
      proficiencies: c.proficiencies.filter((p) => !p.index.startsWith('saving-throw')).map((p) => tr(PROF_ES, p.name, 'competencia')),
      skills: { choose: skillChoice.choose, from: skillChoice.from.options.map((o) => skillOf(o.item.index)) },
      equipment: c.starting_equipment.map((e) => ({ id: e.equipment.index, qty: e.quantity })),
      equipmentChoices: c.starting_equipment_options.map(equipChoice),
      features: features.filter((f) => f.class.index === c.index && !f.subclass && !f.parent).sort((a, b) => a.level - b.level).map(featureOut),
      subclasses: subclasses
        .filter((s) => s.class.index === c.index)
        .map((s) => {
          const fs = features.filter((f) => f.subclass?.index === s.index && !f.parent).sort((a, b) => a.level - b.level);
          return { id: s.index, name: tr(SUBCLASSES_ES, s.name, 'subclase'), en: s.name, level: fs[0]?.level ?? 3, features: fs.map(featureOut) };
        }),
    };
    if (c.spellcasting) {
      out.spellcasting = {
        ability: ability(c.spellcasting.spellcasting_ability),
        prepares: ['cleric', 'druid', 'wizard', 'paladin'].includes(c.index),
        levels: lv.map((l) => {
          const sc = l.spellcasting ?? {};
          return {
            cantrips: sc.cantrips_known ?? 0,
            ...(sc.spells_known !== undefined ? { known: sc.spells_known } : {}),
            slots: Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] ?? 0),
          };
        }),
      };
    }
    walk(out.equipmentChoices);
    return out;
  });

  // ---------- Especies ----------
  const traitOut = (ref) => {
    const t = traitBy.get(ref.index);
    const opts = t.trait_specific?.subtrait_options?.from.options ?? [];
    return {
      name: tr(TRAITS_ES, t.name, 'rasgo'),
      desc: text(t.desc),
      ...(opts.length ? { options: opts.map((o) => traitBy.get(o.item.index)).map((s) => ({ name: tr(TRAITS_ES, s.name, 'rasgo'), desc: text(s.desc) })) } : {}),
    };
  };
  const bonuses = (list) => Object.fromEntries(list.map((b) => [ability(b.ability_score), b.bonus]));
  const traitSkills = (refs) => refs.flatMap((r) => traitBy.get(r.index).proficiencies.filter((p) => p.index.startsWith('skill-')).map((p) => skillOf(p.index)));
  const traitProfs = (refs) =>
    refs.flatMap((r) => traitBy.get(r.index).proficiencies.filter((p) => !p.index.startsWith('skill-')).map((p) => tr(PROF_ES, p.name, 'competencia')));
  const racesOut = races.map((r) => {
    const skillTrait = r.traits.map((t) => traitBy.get(t.index)).find((t) => t.proficiency_choices?.from.options?.some((o) => o.item?.index?.startsWith('skill-')));
    return {
      id: r.index,
      name: tr(RACES_ES, r.name, 'especie'),
      en: r.name,
      speed: r.speed,
      size: tr(SIZE_ES, r.size, 'tamaño'),
      bonuses: bonuses(r.ability_bonuses),
      ...(r.ability_bonus_options
        ? { bonusChoice: { choose: r.ability_bonus_options.choose, amount: r.ability_bonus_options.from.options[0].bonus, from: r.ability_bonus_options.from.options.map((o) => ability(o.ability_score)) } }
        : {}),
      languages: r.languages.map((l) => tr(LANGUAGES_ES, l.name, 'idioma')),
      extraLanguages: r.language_options?.choose ?? 0,
      skills: traitSkills(r.traits),
      ...(skillTrait ? { skillChoice: { choose: skillTrait.proficiency_choices.choose, from: Object.values(SKILLS_KEY) } } : {}),
      proficiencies: traitProfs(r.traits),
      traits: r.traits.map(traitOut),
      subraces: subraces
        .filter((s) => s.race.index === r.index)
        .map((s) => ({
          id: s.index,
          name: tr(SUBRACES_ES, s.name, 'subespecie'),
          en: s.name,
          bonuses: bonuses(s.ability_bonuses),
          traits: s.racial_traits.map(traitOut),
          skills: traitSkills(s.racial_traits),
          proficiencies: traitProfs(s.racial_traits),
          ...(s.racial_traits.some((t) => t.index === 'high-elf-cantrip') ? { cantrip: { choose: 1, classId: 'wizard' } } : {}),
        })),
    };
  });
  // El alto elfo aprende un idioma más ("Extra Language").
  for (const r of racesOut) for (const s of r.subraces) if (s.traits.some((t) => t.name === TRAITS_ES['Extra Language'])) s.extraLanguages = 1;

  // ---------- Trasfondos ----------
  const backgroundsOut = backgrounds.map((b) => {
    const out = {
      id: b.index,
      name: tr(BACKGROUNDS_ES, b.name, 'trasfondo'),
      en: b.name,
      skills: b.starting_proficiencies.filter((p) => p.index.startsWith('skill-')).map((p) => skillOf(p.index)),
      extraLanguages: b.language_options?.choose ?? 0,
      equipment: b.starting_equipment.map((e) => ({ id: e.equipment.index, qty: e.quantity })),
      equipmentChoices: (b.starting_equipment_options ?? []).map(equipChoice),
      gold: b.starting_gold?.quantity ?? 0,
      feature: { name: b.feature.name, desc: text(b.feature.desc) },
    };
    walk(out.equipmentChoices);
    return out;
  });
  backgroundsOut[0].feature.name = { 'Shelter of the Faithful': 'Refugio de los fieles' }[backgroundsOut[0].feature.name] ?? backgroundsOut[0].feature.name;

  const catsOut = {};
  for (const id of [...usedCats].sort()) {
    const cat = categories.find((c) => c.index === id);
    if (!cat) throw new Error(`Categoría ${id} no encontrada`);
    catsOut[id] = { name: CATEGORY_ES[id] ?? cat.name, items: cat.equipment.map((e) => e.index).filter((i) => itemsOut.some((x) => x.id === i)) };
    if (!CATEGORY_ES[id]) missing.add(`categoría: ${id}`);
  }

  // Comprobaciones: todo objeto mencionado existe.
  const itemIds = new Set(itemsOut.map((i) => i.id));
  const refs = [];
  const collect = (o) => {
    if (Array.isArray(o)) o.forEach(collect);
    else if (o && typeof o === 'object') {
      if (typeof o.id === 'string' && typeof o.qty === 'number') refs.push(o.id);
      Object.values(o).forEach(collect);
    }
  };
  collect(classesOut);
  collect(backgroundsOut);
  for (const i of itemsOut) for (const [id] of i.contents ?? []) refs.push(id);
  for (const r of refs) if (!itemIds.has(r)) missing.add(`objeto referido: ${r}`);

  const data = {
    spells: spellsOut,
    items: itemsOut,
    categories: catsOut,
    classes: classesOut,
    races: racesOut,
    backgrounds: backgroundsOut,
    languages: languages.map((l) => tr(LANGUAGES_ES, l.name, 'idioma')),
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(data));
  console.log(`${OUT}: ${spellsOut.length} conjuros, ${itemsOut.length} objetos, ${classesOut.length} clases, ${racesOut.length} especies`);
  if (missing.size) {
    console.warn(`Sin traducir (${missing.size}):\n  ${[...missing].join('\n  ')}`);
    process.exitCode = 1;
  }
}

await main();
