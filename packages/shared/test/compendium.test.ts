import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TEMPLATES,
  createResolver,
  defaultValues,
  evaluate,
  MONSTERS,
  monsterAi,
  monsterById,
  monsterValues,
  proficiencyOf,
  tokenAiSchema,
  type SheetRow,
} from '../src/index.js';

const dnd5e = BUILTIN_TEMPLATES.dnd5e!.template;

describe('compendio de monstruos', () => {
  it('todos los monstruos tienen datos válidos', () => {
    expect(MONSTERS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(MONSTERS.map((m) => m.id)).size).toBe(MONSTERS.length);
    for (const m of MONSTERS) {
      expect(m.attacks.length, m.id).toBeGreaterThan(0);
      for (const a of m.attacks) {
        expect(() => evaluate(`1d20 + ${a.bonus}`, { rng: Math.random }), `${m.id} ${a.name}`).not.toThrow();
        expect(() => evaluate(a.damage, { rng: Math.random }), `${m.id} ${a.name}`).not.toThrow();
      }
      expect(() => evaluate(m.hitDice, { rng: Math.random })).not.toThrow();
      expect(() => tokenAiSchema.parse(monsterAi(m))).not.toThrow();
    }
  });

  it('rellena la hoja de 5e: CA, PG, características, ataques y competencia del VD', () => {
    const ogre = monsterById('ogro')!;
    const values = { ...defaultValues(dnd5e), ...monsterValues(dnd5e, ogre) };
    const r = createResolver(dnd5e, values);
    expect(values).toMatchObject({ ca: 11, pg_actuales: 59, pg_max: 59, velocidad: 40, fue: 19, dados_golpe: '7d10 + 21' });
    expect(r('fue_mod')).toBe(4);
    const attacks = values.ataques as SheetRow[];
    expect(attacks[0]).toMatchObject({ nombre: 'Gran garrote', bono: '+6', dano: '2d8 + 4' });
    expect(attacks[1]!.tipo).toMatch(/a distancia 30 pies/);
    expect(r('competencia')).toBe(2);
    const troll = { ...defaultValues(dnd5e), ...monsterValues(dnd5e, monsterById('trol')!) };
    expect(createResolver(dnd5e, troll)('competencia')).toBe(3);
    expect(createResolver(dnd5e, { ...defaultValues(dnd5e), ...monsterValues(dnd5e, monsterById('dragon-rojo-joven')!) })('competencia')).toBe(4);
    expect(String(values.rasgos)).toMatch(/SRD 5\.1/);
  });

  it('con otra plantilla solo usa los campos que existen', () => {
    const generic = BUILTIN_TEMPLATES.generic!.template;
    const values = monsterValues(generic, monsterById('goblin')!);
    const keys = new Set(Object.keys(defaultValues(generic)));
    for (const k of Object.keys(values)) expect(keys.has(k), k).toBe(true);
  });

  it('la IA sale del tipo de ataque', () => {
    expect(proficiencyOf('1/4')).toBe(2);
    expect(monsterAi(monsterById('mago')!)).toMatchObject({ enabled: true, behavior: 'ranged', range: 24, attackIndex: 0 });
    expect(monsterAi(monsterById('orco')!)).toMatchObject({ behavior: 'melee', reach: 1, attackIndex: 0 });
    expect(monsterAi(monsterById('gigante-colinas')!)).toMatchObject({ reach: 2 });
    // La mantícora dispara púas: ataque a distancia aunque no sea el primero de cuerpo a cuerpo.
    expect(monsterAi(monsterById('manticora')!)).toMatchObject({ behavior: 'ranged', attackIndex: 0, range: 20 });
  });
});
