import { describe, expect, it } from 'vitest';
import {
  armorClass,
  BUILTIN_TEMPLATES,
  expandItems,
  finalAbilities,
  loadSrd,
  pointBuyCost,
  resolveGear,
  roll4d6,
  spellLimits,
  srdCharacterValues,
  srdIndex,
  sheetTemplateSchema,
  validScores,
  type SrdBuild,
} from '../src/index.js';

const data = await loadSrd();
const idx = srdIndex(data);
const template = BUILTIN_TEMPLATES.dnd5e!.template;

describe('datos del SRD', () => {
  it('trae todo traducido y enlazado', () => {
    expect(data.spells).toHaveLength(319);
    expect(data.classes.map((c) => c.name)).toContain('Mago');
    expect(idx.spell('fireball')).toMatchObject({ name: 'Bola de fuego', level: 3, save: 'des', time: '1 acción', range: '150 pies' });
    expect(idx.item('longsword')?.weapon).toMatchObject({ damage: '1d8', type: 'cortante', twoHanded: '1d10' });
    // Todo lo que se puede elegir existe.
    for (const c of [...data.classes, ...data.backgrounds])
      for (const ch of c.equipmentChoices)
        for (const g of ch.options.flat()) {
          if ('id' in g) expect(idx.item(g.id), g.id).toBeTruthy();
          else expect(data.categories[g.category]?.items.length, g.category).toBeGreaterThan(0);
        }
    const sk = new Set(template.sections.flatMap((s) => s.fields.map((f) => f.key)));
    for (const c of data.classes) for (const s of c.skills.from) expect(sk.has(`${s}_comp`), s).toBe(true);
  });
});

describe('puntuaciones', () => {
  it('compra por puntos, serie estándar y 4d6', () => {
    expect(pointBuyCost([15, 15, 15, 8, 8, 8])).toBe(27);
    expect(pointBuyCost([16, 8, 8, 8, 8, 8])).toBeNull();
    expect(validScores('pointbuy', [15, 15, 15, 8, 8, 9])).toBe(false);
    expect(validScores('array', [8, 10, 12, 13, 14, 15])).toBe(true);
    expect(validScores('array', [8, 10, 12, 13, 14, 14])).toBe(false);
    const seq = [0.99, 0, 0.5, 0.99];
    expect(roll4d6(() => seq.shift()!).total).toBe(6 + 4 + 6);
  });

  it('suma los bonos de especie y los elegidos', () => {
    const halfElf = idx.race('half-elf')!;
    const base = { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };
    expect(finalAbilities({ abilities: base, bonusChoice: ['fue', 'con', 'des'] }, halfElf)).toEqual({ fue: 11, des: 10, con: 11, int: 10, sab: 10, car: 12 });
  });
});

describe('equipo y conjuros', () => {
  it('resuelve elecciones, abre paquetes y calcula la CA', () => {
    const fighter = idx.cls('fighter')!;
    expect(resolveGear(fighter.equipmentChoices[1]!.options[0]!, [['longsword']])).toEqual([{ id: 'longsword', qty: 1 }, { id: 'shield', qty: 1 }]);
    const items = expandItems([{ id: 'explorers-pack', qty: 1 }, { id: 'torch', qty: 1 }], data);
    expect(items.find((i) => i.id === 'torch')?.qty).toBe(11);
    expect(items.some((i) => i.id === 'explorers-pack')).toBe(false);
    const s = { fue: 16, des: 14, con: 14, int: 10, sab: 12, car: 8 };
    expect(armorClass([idx.item('chain-mail'), idx.item('shield')], s, fighter)).toBe(18);
    expect(armorClass([idx.item('scale-mail')], { ...s, des: 18 })).toBe(16); // máximo +2
    expect(armorClass([], s, idx.cls('barbarian'))).toBe(14);
    expect(armorClass([], s, idx.cls('monk'))).toBe(13);
  });

  it('límites de conjuros por clase y nivel', () => {
    expect(spellLimits(idx.cls('wizard')!, 1, 3)).toEqual({ cantrips: 3, spells: 6, maxLevel: 1 });
    expect(spellLimits(idx.cls('cleric')!, 3, 3)).toEqual({ cantrips: 3, spells: 6, maxLevel: 2 });
    expect(spellLimits(idx.cls('sorcerer')!, 1, 3)).toEqual({ cantrips: 4, spells: 2, maxLevel: 1 });
    expect(spellLimits(idx.cls('paladin')!, 1, 2)).toMatchObject({ spells: 0, maxLevel: 0 });
    expect(spellLimits(idx.cls('fighter')!, 5, 0)).toEqual({ cantrips: 0, spells: 0, maxLevel: 0 });
  });
});

describe('hoja creada con el SRD', () => {
  const build: SrdBuild = {
    raceId: 'elf',
    subraceId: 'high-elf',
    classId: 'wizard',
    level: 3,
    abilities: { fue: 8, des: 14, con: 13, int: 15, sab: 12, car: 10 },
    bonusChoice: [],
    backgroundId: 'acolyte',
    skills: ['c_arcano', 'investigacion'],
    items: [
      { id: 'quarterstaff', qty: 1 },
      { id: 'scholars-pack', qty: 1 },
      { id: 'spellbook', qty: 1 },
    ],
    spells: ['fire-bolt', 'light', 'mage-hand', 'magic-missile', 'shield', 'cure-wounds'],
    options: {},
    languages: ['Dracónico'],
    alignment: 'Neutral bueno',
  };

  it('rellena características, competencias, PG, CA, ataques, conjuros e inventario', () => {
    const v = srdCharacterValues(template, build, data);
    expect(v).toMatchObject({ fue: 8, des: 16, int: 16, clase: 'Mago', nivel: 3, raza: 'Alto elfo', trasfondo: 'Acólito', alineamiento: 'Neutral bueno', velocidad: 30 });
    // 6 + 1 al nivel 1 y 4 + 1 por cada nivel más.
    expect(v).toMatchObject({ pg_max: 17, pg_actuales: 17, dados_golpe: '1d6', ca: 13 });
    expect(v).toMatchObject({ sv_int_comp: true, sv_sab_comp: true, percepcion_comp: true, perspicacia_comp: true, religion_comp: true, c_arcano_comp: true });
    expect(v.sv_fue_comp).toBeUndefined();
    expect(v).toMatchObject({ conj_caracteristica: 'int', espacios_1_max: 4, espacios_2_max: 2, espacios_3_max: 0, po: 15 });
    const attacks = v.ataques as Record<string, unknown>[];
    expect(attacks[0]).toMatchObject({ nombre: 'Bastón', bono: '+1', dano: '1d6 - 1' });
    expect(attacks.find((a) => a.nombre === 'Descarga de fuego')).toMatchObject({ bono: '+5', dano: '1d10' });
    const spells = v.conjuros as Record<string, unknown>[];
    expect(spells.map((s) => s.nivel)).toEqual([0, 0, 0, 1, 1, 1]);
    expect(spells.find((s) => s.nombre === 'Curar heridas')).toMatchObject({ efecto: '1d8 + 3' });
    expect(spells.find((s) => s.nombre === 'Proyectil mágico')?.notas).toContain('fuerza');
    expect((v.inventario as Record<string, unknown>[]).find((i) => i.objeto === 'Libro de conjuros')).toMatchObject({ cantidad: 1, peso: 3 });
    expect(v.competencias).toContain('Idiomas: Común, Élfico, Dracónico.');
    expect(v.competencias).toContain('Espadas largas');
    expect(v.rasgos).toContain('Nv 2 · ');
  });

  it('ignora los campos que la plantilla no tiene', () => {
    const small = sheetTemplateSchema.parse({ ...template, sections: template.sections.filter((s) => s.id === 'caracteristicas') });
    expect(Object.keys(srdCharacterValues(small, build, data)).sort()).toEqual(['car', 'con', 'des', 'fue', 'int', 'sab']);
  });
});
