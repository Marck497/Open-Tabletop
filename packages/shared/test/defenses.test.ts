import { describe, expect, it } from 'vitest';
import {
  applyDefenses,
  BUILTIN_TEMPLATES,
  DAMAGE_TYPE_SUGGESTIONS,
  defensesOf,
  monsterValues,
  MONSTERS,
  parseDamageTypes,
  traitDefenses,
  upgradeDnd5e,
} from '../src/index.js';

const t = BUILTIN_TEMPLATES.dnd5e!.template;

describe('resistencias, inmunidades y vulnerabilidades', () => {
  it('lee los tipos sin importar mayúsculas, tildes ni separadores', () => {
    expect(parseDamageTypes('Fuego, frío y Relámpago; veneno')).toEqual(['fuego', 'frio', 'relampago', 'veneno']);
  });

  it('los tipos en inglés valen igual que en español', () => {
    expect(parseDamageTypes('Fire, cold and Lightning')).toEqual(['fuego', 'frio', 'relampago']);
    const def = { resist: parseDamageTypes('fuego'), immune: [], vulnerable: [] };
    expect(applyDefenses([{ type: 'fire', amount: 9 }], def).total).toBe(4);
  });

  it('inmune anula, resistente divide (hacia abajo), vulnerable dobla y resistente + vulnerable se anulan', () => {
    const def = { resist: ['fuego', 'frio'], immune: ['veneno'], vulnerable: ['frio', 'radiante'] };
    const r = applyDefenses(
      [
        { type: 'Fuego', amount: 7 },
        { type: 'veneno', amount: 10 },
        { type: 'frío', amount: 4 },
        { type: 'radiante', amount: 5 },
        { type: '', amount: 2 },
      ],
      def,
    );
    expect(r.total).toBe(3 + 0 + 4 + 10 + 2);
    expect(r.notes).toEqual(['resiste Fuego', 'inmune veneno', 'vulnerable radiante']);
    // «todo» cubre cualquier tipo, también el daño sin tipo.
    expect(applyDefenses([{ type: '', amount: 9 }], { resist: ['todo'], immune: [], vulnerable: [] }).total).toBe(4);
  });

  it('salen de la hoja de 5e y de estados como furia o petrificado', () => {
    const values = { resistencias: 'necrótico', inmunidades: 'veneno', vulnerabilidades: '' };
    expect(defensesOf(t, values)).toEqual({ resist: ['necrotico'], immune: ['veneno'], vulnerable: [] });
    expect(defensesOf(t, null, ['furia']).resist).toEqual(['contundente', 'perforante', 'cortante']);
    expect(defensesOf(t, null, ['petrificado']).resist).toEqual(['todo']);
  });

  it('las plantillas de 5e antiguas reciben los campos al ponerse al día', () => {
    const old = structuredClone(t);
    old.version = 2;
    delete old.combat!.defenses;
    for (const s of old.sections) s.fields = s.fields.filter((f) => !['resistencias', 'inmunidades', 'vulnerabilidades'].includes(f.key));
    const up = upgradeDnd5e(old);
    expect(up.combat?.defenses).toEqual({ resist: 'resistencias', immune: 'inmunidades', vulnerable: 'vulnerabilidades' });
    expect(up.sections.flatMap((s) => s.fields).some((f) => f.key === 'inmunidades')).toBe(true);
  });

  it('los monstruos del compendio traen sus defensas de los rasgos', () => {
    expect(traitDefenses('Vulnerable al daño contundente. Inmune al veneno y al agotamiento.', DAMAGE_TYPE_SUGGESTIONS)).toEqual({
      resist: [],
      immune: ['veneno'],
      vulnerable: ['contundente'],
    });
    const skeleton = MONSTERS.find((m) => m.id === 'esqueleto')!;
    expect(monsterValues(t, skeleton)).toMatchObject({ vulnerabilidades: 'contundente', inmunidades: 'veneno' });
    const gargoyle = MONSTERS.find((m) => m.id === 'gargola')!;
    expect(monsterValues(t, gargoyle).resistencias).toBe('contundente, perforante, cortante');
  });
});
