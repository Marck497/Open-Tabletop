import type { SheetField, SheetTemplateInput } from '../schemas/sheet.js';

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

export const dnd5eTemplate: SheetTemplateInput = {
  name: 'D&D 5e',
  version: 1,
  bars: [{ value: 'pg_actuales', max: 'pg_max', color: '#c0392b' }],
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
          ],
        },
      ],
    },
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
