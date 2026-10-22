import { DND5E_STATUSES } from './statuses.js';
import type { SheetField, SheetSection, SheetTemplate, SheetTemplateInput } from '../schemas/sheet.js';

/** Plantilla de D&D 5e (en español). Es un punto de partida: el DM puede editarla entera. */

const ABILITIES = [
  ['fue', 'Fuerza'],
  ['des', 'Destreza'],
  ['con', 'Constitución'],
  ['int', 'Inteligencia'],
  ['sab', 'Sabiduría'],
  ['car', 'Carisma'],
] as const;

const SKILLS: [key: string, label: string, ability: string][] = [
  ['acrobacias', 'Acrobacias', 'des'],
  ['atletismo', 'Atletismo', 'fue'],
  ['c_arcano', 'C. Arcano', 'int'],
  ['engano', 'Engaño', 'car'],
  ['historia', 'Historia', 'int'],
  ['interpretacion', 'Interpretación', 'car'],
  ['intimidacion', 'Intimidación', 'car'],
  ['investigacion', 'Investigación', 'int'],
  ['juego_manos', 'Juego de manos', 'des'],
  ['medicina', 'Medicina', 'sab'],
  ['naturaleza', 'Naturaleza', 'int'],
  ['percepcion', 'Percepción', 'sab'],
  ['perspicacia', 'Perspicacia', 'sab'],
  ['persuasion', 'Persuasión', 'car'],
  ['religion', 'Religión', 'int'],
  ['sigilo', 'Sigilo', 'des'],
  ['supervivencia', 'Supervivencia', 'sab'],
  ['trato_animales', 'Trato con animales', 'sab'],
];

const abilityFields: SheetField[] = ABILITIES.flatMap(([k, label]) => [
  { key: k, label, type: 'number', default: 10 },
  { key: `${k}_mod`, label: 'Mod.', type: 'computed', formula: `floor((${k} - 10) / 2)`, roll: `1d20 + @{${k}_mod}`, rollLabel: `Prueba de ${label}` },
]);

const saveFields: SheetField[] = ABILITIES.flatMap(([k, label]) => [
  { key: `sv_${k}_comp`, label: 'Comp.', type: 'checkbox' },
  {
    key: `sv_${k}`,
    label,
    type: 'computed',
    formula: `${k}_mod + if(sv_${k}_comp, competencia, 0) + sv_bono`,
    roll: `1d20 + @{sv_${k}}`,
    rollLabel: `Salvación de ${label}`,
  },
]);

const skillFields: SheetField[] = SKILLS.flatMap(([k, label, ab]) => [
  { key: `${k}_comp`, label: 'Comp.', type: 'checkbox' },
  { key: `${k}_exp`, label: 'Pericia', type: 'checkbox' },
  {
    key: k,
    label: `${label} (${ab.toUpperCase()})`,
    type: 'computed',
    formula: `${ab}_mod + if(${k}_exp, competencia * 2, if(${k}_comp, competencia, 0))`,
    roll: `1d20 + @{${k}}`,
    rollLabel: label,
  },
]);

/** Versión de la plantilla de serie. Las partidas con una anterior reciben lo nuevo con `upgradeDnd5e`. */
export const DND5E_VERSION = 3;

/** Columnas de daño extra y crítico de la tabla de ataques (versión 2). */
const ATTACK_EXTRA_COLUMNS: SheetField[] = [
  { key: 'extra', label: 'Daño extra', type: 'text', hint: 'Se suma al daño, p. ej. "1d6 fuego" o "2d6"', roll: '@{extra}', rollLabel: 'Daño extra' },
  { key: 'critico', label: 'Crítico con', type: 'number', default: 20, hint: 'Número mínimo del d20 para crítico (19 con Crítico mejorado)' },
];

export const RECHARGE_OPTIONS = [
  { value: 'largo', label: 'Descanso largo' },
  { value: 'corto', label: 'Descanso corto' },
  { value: '', label: 'A mano' },
];

/** Recursos con usos que se recargan al descansar (versión 2). */
const RESOURCES_SECTION: SheetSection = {
  id: 'recursos',
  title: 'Recursos y usos',
  columns: 1,
  fields: [
    {
      key: 'recursos',
      label: 'Rasgos y objetos con usos (furia, ki, canalizar divinidad, cargas…)',
      type: 'list',
      columns: [
        { key: 'nombre', label: 'Nombre', type: 'text' },
        { key: 'usos', label: 'Quedan', type: 'number', default: 1 },
        { key: 'max', label: 'Máx.', type: 'number', default: 1 },
        { key: 'recarga', label: 'Se recarga con', type: 'select', default: 'largo', options: RECHARGE_OPTIONS },
      ],
    },
  ],
};

/** Resistencias, inmunidades y vulnerabilidades al daño (versión 3): las usa 🎯 Aplicar. */
const DEFENSE_FIELDS: SheetField[] = [
  { key: 'resistencias', label: 'Resistencias al daño', type: 'text', span: 4, hint: 'Tipos separados por comas, p. ej. "fuego, veneno" ("todo" = cualquiera)' },
  { key: 'inmunidades', label: 'Inmunidades al daño', type: 'text', span: 4, hint: 'Tipos separados por comas' },
  { key: 'vulnerabilidades', label: 'Vulnerabilidades al daño', type: 'text', span: 4, hint: 'Tipos separados por comas' },
];
const DEFENSES_MAPPING = { resist: 'resistencias', immune: 'inmunidades', vulnerable: 'vulnerabilidades' };

const PACT_FIELD: SheetField = { key: 'espacios_pacto', label: 'Espacios de pacto (vuelven con descanso corto)', type: 'checkbox', span: 2 };

export const dnd5eTemplate: SheetTemplateInput = {
  name: 'D&D 5e',
  version: DND5E_VERSION,
  bars: [{ value: 'pg_actuales', max: 'pg_max', color: '#c0392b' }],
  statuses: DND5E_STATUSES,
  combat: {
    ac: 'ca',
    hp: 'pg_actuales',
    hpMax: 'pg_max',
    hpTemp: 'pg_temporales',
    speed: 'velocidad',
    attacks: { list: 'ataques', name: 'nombre', attack: 'bono', damage: 'dano', extra: 'extra', crit: 'critico' },
    spells: { list: 'conjuros', name: 'nombre', level: 'nivel', effect: 'efecto' },
    slots: { max: 'espacios_{n}_max', used: 'espacios_{n}_usados', pact: 'espacios_pacto' },
    resources: { list: 'recursos', name: 'nombre', uses: 'usos', max: 'max', recharge: 'recarga' },
    inventory: { list: 'inventario', name: 'objeto', qty: 'cantidad', weight: 'peso' },
    saves: 'sv_{a}',
    spellAttack: 'conj_ataque',
    spellDc: 'conj_cd',
    spellMod: 'conj_mod',
    defenses: DEFENSES_MAPPING,
    coins: ['pc', 'pp', 'pe', 'po', 'ppt'],
  },
  sections: [
    {
      id: 'cabecera',
      title: 'Personaje',
      columns: 4,
      fields: [
        { key: 'clase', label: 'Clase', type: 'text', span: 2 },
        { key: 'nivel', label: 'Nivel', type: 'number', default: 1 },
        { key: 'px', label: 'PX', type: 'number', default: 0 },
        { key: 'raza', label: 'Especie / raza', type: 'text', span: 2 },
        { key: 'trasfondo', label: 'Trasfondo', type: 'text' },
        { key: 'alineamiento', label: 'Alineamiento', type: 'text' },
      ],
    },
    { id: 'caracteristicas', title: 'Características', columns: 4, fields: abilityFields },
    {
      id: 'combate',
      title: 'Combate',
      columns: 4,
      fields: [
        { key: 'ca', label: 'Clase de armadura', type: 'number', default: 10 },
        { key: 'iniciativa_bono', label: 'Bono iniciativa extra', type: 'number', default: 0 },
        {
          key: 'iniciativa',
          label: 'Iniciativa',
          type: 'computed',
          formula: 'des_mod + iniciativa_bono',
          roll: '1d20 + @{iniciativa}',
          rollLabel: 'Iniciativa',
          initiative: true,
        },
        { key: 'velocidad', label: 'Velocidad (pies)', type: 'number', default: 30 },
        { key: 'pg_max', label: 'PG máximos', type: 'number', default: 10 },
        { key: 'pg_actuales', label: 'PG actuales', type: 'number', default: 10 },
        { key: 'pg_temporales', label: 'PG temporales', type: 'number', default: 0 },
        { key: 'competencia', label: 'Bono de competencia', type: 'computed', formula: '2 + floor((max(nivel, 1) - 1) / 4)' },
        { key: 'dados_golpe', label: 'Dados de golpe', type: 'text', default: '1d8', roll: '@{dados_golpe} + @{con_mod}', rollLabel: 'Dado de golpe' },
        { key: 'exitos_muerte', label: 'Éxitos vs muerte', type: 'number', default: 0, roll: '1d20', rollLabel: 'Salvación contra muerte' },
        { key: 'fallos_muerte', label: 'Fallos vs muerte', type: 'number', default: 0 },
        ...DEFENSE_FIELDS,
      ],
    },
    {
      id: 'salvaciones',
      title: 'Tiradas de salvación',
      columns: 4,
      fields: [...saveFields, { key: 'sv_bono', label: 'Bono extra a salvaciones', type: 'number', default: 0, span: 2 }],
    },
    {
      id: 'habilidades',
      title: 'Habilidades',
      columns: 3,
      fields: [
        ...skillFields,
        { key: 'percepcion_pasiva', label: 'Percepción pasiva', type: 'computed', formula: '10 + percepcion', span: 3 },
      ],
    },
    {
      id: 'ataques',
      title: 'Ataques',
      columns: 1,
      fields: [
        {
          key: 'ataques',
          label: 'Ataques y trucos',
          type: 'list',
          columns: [
            { key: 'nombre', label: 'Nombre', type: 'text' },
            { key: 'bono', label: 'Bono ataque', type: 'text', default: '+0', roll: '1d20 + @{bono}', rollLabel: 'Ataque' },
            { key: 'dano', label: 'Daño', type: 'text', default: '1d6', roll: '@{dano}', rollLabel: 'Daño' },
            { key: 'tipo', label: 'Tipo', type: 'text' },
            ...ATTACK_EXTRA_COLUMNS,
          ],
        },
      ],
    },
    RESOURCES_SECTION,
    {
      id: 'conjuros',
      title: 'Conjuros',
      columns: 4,
      fields: [
        {
          key: 'conj_caracteristica',
          label: 'Característica',
          type: 'select',
          default: 'int',
          options: [
            { value: 'int', label: 'Inteligencia' },
            { value: 'sab', label: 'Sabiduría' },
            { value: 'car', label: 'Carisma' },
          ],
        },
        {
          key: 'conj_mod',
          label: 'Mod. lanzamiento',
          type: 'computed',
          formula: 'if(conj_caracteristica == "int", int_mod, if(conj_caracteristica == "sab", sab_mod, car_mod))',
        },
        { key: 'conj_cd', label: 'CD de salvación', type: 'computed', formula: '8 + competencia + conj_mod' },
        {
          key: 'conj_ataque',
          label: 'Ataque de conjuro',
          type: 'computed',
          formula: 'competencia + conj_mod',
          roll: '1d20 + @{conj_ataque}',
          rollLabel: 'Ataque de conjuro',
        },
        ...Array.from({ length: 9 }, (_, i): SheetField[] => [
          { key: `espacios_${i + 1}_max`, label: `Espacios nv ${i + 1}`, type: 'number', default: 0 },
          { key: `espacios_${i + 1}_usados`, label: 'Usados', type: 'number', default: 0 },
        ]).flat(),
        PACT_FIELD,
        {
          key: 'conjuros',
          label: 'Lista de conjuros',
          type: 'list',
          span: 4,
          columns: [
            { key: 'nivel', label: 'Nv', type: 'number', default: 0 },
            { key: 'nombre', label: 'Conjuro', type: 'text' },
            { key: 'preparado', label: 'Prep.', type: 'checkbox' },
            { key: 'efecto', label: 'Tirada (opcional)', type: 'text', roll: '@{efecto}', rollLabel: 'Conjuro' },
            { key: 'notas', label: 'Notas', type: 'text' },
          ],
        },
      ],
    },
    {
      id: 'equipo',
      title: 'Equipo',
      columns: 5,
      fields: [
        { key: 'pc', label: 'PC', type: 'number', default: 0 },
        { key: 'pp', label: 'PP', type: 'number', default: 0 },
        { key: 'pe', label: 'PE', type: 'number', default: 0 },
        { key: 'po', label: 'PO', type: 'number', default: 0 },
        { key: 'ppt', label: 'PPT', type: 'number', default: 0 },
        {
          key: 'inventario',
          label: 'Inventario',
          type: 'list',
          span: 5,
          columns: [
            { key: 'objeto', label: 'Objeto', type: 'text' },
            { key: 'cantidad', label: 'Cant.', type: 'number', default: 1 },
            { key: 'peso', label: 'Peso', type: 'number', default: 0 },
          ],
        },
      ],
    },
    {
      id: 'rasgos',
      title: 'Rasgos y notas',
      columns: 2,
      fields: [
        { key: 'competencias', label: 'Competencias e idiomas', type: 'textarea' },
        { key: 'rasgos', label: 'Rasgos y atributos', type: 'textarea' },
        { key: 'personalidad', label: 'Personalidad, ideales, vínculos, defectos', type: 'textarea' },
        { key: 'notas', label: 'Notas', type: 'textarea' },
      ],
    },
  ],
};

/**
 * Pone al día una plantilla de 5e guardada con una versión anterior: añade las columnas de daño
 * extra y crítico, la sección de recursos, la casilla de espacios de pacto y lo que usan los
 * botones de acción. Solo añade lo que falta; lo que el DM haya cambiado se respeta.
 */
export function upgradeDnd5e(template: SheetTemplate): SheetTemplate {
  if (template.name !== 'D&D 5e' || template.version >= DND5E_VERSION) return template;
  const t: SheetTemplate = structuredClone(template);
  const keys = new Set(t.sections.flatMap((s) => s.fields.map((f) => f.key)));
  const attacks = t.sections.flatMap((s) => s.fields).find((f) => f.key === 'ataques' && f.type === 'list');
  if (attacks?.columns) for (const c of ATTACK_EXTRA_COLUMNS) if (!attacks.columns.some((x) => x.key === c.key)) attacks.columns.push(structuredClone(c));
  if (!keys.has('recursos') && !t.sections.some((s) => s.id === RESOURCES_SECTION.id)) {
    const at = t.sections.findIndex((s) => s.id === 'ataques');
    t.sections.splice(at < 0 ? t.sections.length : at + 1, 0, structuredClone(RESOURCES_SECTION));
  }
  const spells = t.sections.find((s) => s.fields.some((f) => f.key === 'conjuros'));
  if (spells && !keys.has(PACT_FIELD.key)) spells.fields.splice(spells.fields.findIndex((f) => f.key === 'conjuros'), 0, structuredClone(PACT_FIELD));
  const combatSection = t.sections.find((s) => s.fields.some((f) => f.key === 'pg_actuales'));
  if (combatSection) for (const f of DEFENSE_FIELDS) if (!keys.has(f.key)) combatSection.fields.push(structuredClone(f));
  if (t.combat) {
    const has = (k: string) => t.sections.some((s) => s.fields.some((f) => f.key === k));
    if (t.combat.attacks?.list === 'ataques') t.combat.attacks = { ...t.combat.attacks, extra: t.combat.attacks.extra ?? 'extra', crit: t.combat.attacks.crit ?? 'critico' };
    if (t.combat.spells === undefined && has('conjuros')) t.combat.spells = { list: 'conjuros', name: 'nombre', level: 'nivel', effect: 'efecto' };
    if (t.combat.slots === undefined && has('espacios_1_max')) t.combat.slots = { max: 'espacios_{n}_max', used: 'espacios_{n}_usados', pact: 'espacios_pacto' };
    if (t.combat.defenses === undefined && has('resistencias')) t.combat.defenses = { ...DEFENSES_MAPPING };
    if (t.combat.resources === undefined && has('recursos')) t.combat.resources = { list: 'recursos', name: 'nombre', uses: 'usos', max: 'max', recharge: 'recarga' };
  }
  t.version = DND5E_VERSION;
  return t;
}
