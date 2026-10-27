#!/usr/bin/env node
// Genera packages/shared/src/i18n/en/srd.ts: los nombres del SRD (rasgos, especies, objetos, idiomas…)
// de vuelta al inglés original, invirtiendo las tablas de traducción de esta carpeta. Así la interfaz en
// inglés los enseña en inglés sin tocar data.json.
// Uso: node scripts/srd/en-names.mjs   (después de cambiar data.json o las tablas es-*.mjs)
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureEs } from './es-features.mjs';
import * as misc from './es-misc.mjs';
import { SPELLS_ES } from './es-spells.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '../../packages/shared/src/srd/data.json');
const OUT = join(here, '../../packages/shared/src/i18n/en/srd.ts');
const data = JSON.parse(await readFile(DATA, 'utf8'));

const out = new Map();
const add = (es, en) => {
  if (typeof es === 'string' && typeof en === 'string' && es && es !== en && !out.has(es)) out.set(es, en);
};

// Tablas inglés → español: se invierten tal cual.
// Primero lo que solo se traduce por aquí (tamaños, idiomas…): si una palabra está en dos tablas, como
// «Mediano» (tamaño y especie), gana esta, porque especies, clases, conjuros y objetos ya traen su `en`.
for (const table of [misc.SIZE_ES, misc.RARITY, misc.ARMOR_KIND, misc.PROF_ES, misc.LANGUAGES_ES, misc.DAMAGE_ES, misc.PROPERTIES_ES, misc.SCHOOLS_ES, misc.TRAITS_ES, misc.EQUIPMENT_ES, SPELLS_ES, misc.CLASSES_ES, misc.SUBCLASSES_ES, misc.RACES_ES, misc.SUBRACES_ES, misc.BACKGROUNDS_ES]) {
  for (const [en, es] of Object.entries(table)) add(es, en);
}
// Categorías: la clave es el id de 5e-database ("simple-weapons"); se pasa a texto en inglés.
const words = (id) => id.replace(/-/g, ' ');
for (const [id, es] of Object.entries(misc.ITEM_CAT)) add(es, words(id).replace(/s$/, ''));
for (const [id, es] of Object.entries(misc.CATEGORY_ES)) add(es, `a ${words(id).replace(/s$/, '')}`.replace(/^a ([aeiou])/, 'an $1'));

// Rasgos de clase: featureEs traduce por partes ("Fighting Style: Defense (2 uses)"), así que se
// prueba a deshacer cada parte y solo se guarda si al volver a traducir sale lo mismo.
const featureNames = new Set(data.classes.flatMap((c) => [...c.features, ...c.subclasses.flatMap((s) => s.features)]).flatMap((f) => [f.name, ...(f.options ?? []).map((o) => o.name)]));
const PAREN = [
  [/^(\d+) dados?$/, (_, n) => `${n} ${n === '1' ? 'die' : 'dice'}`],
  [/^(\d+) usos?$/, (_, n) => `${n} ${n === '1' ? 'use' : 'uses'}`],
  [/^(\d+)\/descanso$/, (_, n) => `${n}/rest`],
  [/^(\d+) tipos? de terreno$/, (_, n) => `${n} terrain ${n === '1' ? 'type' : 'types'}`],
  [/^(\d+) tipos?$/, (_, n) => `${n} ${n === '1' ? 'type' : 'types'}`],
  [/^(\d+) enemigos$/, (_, n) => `${n} enemies`],
  [/^nivel (\d+)$/, (_, n) => `${n}th level`],
  [/^VD (\S+) o menos(, sin volar ni nadar|, sin volar)?$/, (_, cr, x) => `CR ${cr} or below${x ? (x.includes('nadar') ? ', no flying or swim speed' : ', no flying speed') : ''}`],
];
const parenEn = (p) => {
  for (const [re, fn] of PAREN) if (re.test(p)) return p.replace(re, fn);
  return p;
};
// Las parejas de la tabla interna de es-features.mjs, leídas del propio archivo.
const src = await readFile(join(here, 'es-features.mjs'), 'utf8');
const pairs = [...src.matchAll(/(?:'([^']+)'|"([^"]+)"|([A-Za-z]+)): '([^']+)'/g)].map((m) => [m[1] ?? m[2] ?? m[3], m[4]]);
const inverse = new Map();
for (const [en, es] of pairs) if (!inverse.has(es)) inverse.set(es, en);
const COLORS = { Negro: 'Black', Azul: 'Blue', Latón: 'Brass', Bronce: 'Bronze', Cobre: 'Copper', Oro: 'Gold', Verde: 'Green', Rojo: 'Red', Plata: 'Silver', Blanco: 'White' };
const DAMAGE = { ácido: 'Acid', relámpago: 'Lightning', fuego: 'Fire', veneno: 'Poison', frío: 'Cold' };
for (const name of featureNames) {
  const dragon = name.match(/^Antepasado dracónico: (\S+) \((\S+)\)$/);
  let en;
  if (dragon) en = `Dragon Ancestor: ${COLORS[dragon[1]]} - ${DAMAGE[dragon[2]]} Damage`;
  else {
    const m = name.match(/^(.*?)(?: \(([^)]*)\))?$/);
    en = m[1].split(': ').map((p) => inverse.get(p) ?? p).join(': ') + (m[2] ? ` (${parenEn(m[2])})` : '');
  }
  if (featureEs(en) === name) add(name, en);
}

const entries = [...out.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
const body = entries.map(([es, en]) => `  ${JSON.stringify(es)}: ${JSON.stringify(en)},`).join('\n');
await writeFile(
  OUT,
  `// Generado con scripts/srd/en-names.mjs: nombres del SRD de vuelta al inglés original. No lo edites a mano.\nexport const SRD_EN: Record<string, string> = {\n${body}\n};\n`,
);
const missingFeatures = [...featureNames].filter((n) => !out.has(n));
console.log(`${entries.length} nombres; rasgos de clase sin deshacer: ${missingFeatures.length}`);
if (missingFeatures.length) console.log(missingFeatures.slice(0, 30).join('\n'));
