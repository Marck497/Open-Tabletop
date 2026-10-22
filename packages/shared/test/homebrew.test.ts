import { describe, expect, it } from 'vitest';
import {
  actionsOf,
  blankHomebrew,
  BUILTIN_TEMPLATES,
  createHomebrewSchema,
  damagePatch,
  healPatch,
  homebrewDataSchema,
  homebrewFromSrdItem,
  homebrewFromSrdSpell,
  homebrewRows,
  homebrewSummary,
  itemsInArea,
  parseSrdArea,
  rollHomebrew,
  saveOptions,
  upcastExpression,
  type HomebrewEntry,
  type SrdItem,
  type SrdSpell,
} from '../src/index.js';

const t5e = BUILTIN_TEMPLATES.dnd5e!.template;
const entry = (kind: HomebrewEntry['kind'], data: object, name = 'Prueba'): Pick<HomebrewEntry, 'id' | 'kind' | 'name' | 'data'> => ({ id: 'h1', kind, name, data: homebrewDataSchema.parse(data) });
/** Generador que siempre saca el máximo (o el mínimo con 0). */
const fixed = (v: number) => () => v;

describe('creaciones', () => {
  it('la plantilla de 5e trae salvaciones, inventario y ataque/CD de conjuro', () => {
    const a = actionsOf(t5e);
    expect(a).toMatchObject({ saves: 'sv_{a}', spellAttack: 'conj_ataque', spellDc: 'conj_cd', spellMod: 'conj_mod', inventory: { list: 'inventario', name: 'objeto', qty: 'cantidad' } });
    expect(saveOptions(t5e).map((s) => s.value)).toEqual(['fue', 'des', 'con', 'int', 'sab', 'car']);
    expect(saveOptions(t5e)[1]).toEqual({ value: 'des', key: 'sv_des', label: 'Destreza' });
    // Una plantilla sin esos campos no los usa.
    expect(actionsOf(BUILTIN_TEMPLATES.generic!.template)).toMatchObject({ saves: '', spellAttack: '', inventory: null });
    expect(blankHomebrew('spell', t5e)).toMatchObject({ attackBonus: '@{conj_ataque}', saveDc: '@{conj_cd}', level: 1 });
  });

  it('valida las fórmulas al guardar', () => {
    expect(createHomebrewSchema.safeParse({ kind: 'spell', name: 'X', data: { heal: '2d4 +' } }).success).toBe(false);
    expect(createHomebrewSchema.safeParse({ kind: 'spell', name: 'X', data: { heal: '2d4 + @{conj_mod}' } }).success).toBe(true);
  });

  it('mejora por nivel de espacio', () => {
    expect(upcastExpression('8d6', '1d6', 2)).toBe('10d6');
    expect(upcastExpression('3d4 + 3', '1d4', 1)).toBe('4d4 + 3');
    expect(upcastExpression('1d8 + @{conj_mod}', '2d6', 2)).toBe('1d8 + @{conj_mod} + 4d6');
    expect(upcastExpression('5', '2', 2)).toBe('5 + (2) + (2)');
    expect(upcastExpression('8d6', '1d6', 0)).toBe('8d6');
  });

  it('tira ataque con crítico (dobla dados), daños por tipo, curación y CD', () => {
    const d = homebrewDataSchema.parse({ attack: 'ranged', attackBonus: '@{x}', critFrom: 19, save: 'con', saveDc: '8 + @{x}', damage: [{ dice: '2d6 + 1', type: 'fuego' }, { dice: '1d4', type: 'frío' }], heal: '3' });
    const r = rollHomebrew(d, { resolve: (n) => (n === 'x' ? 4 : undefined), rng: fixed(0.999) });
    expect(r.attack).toMatchObject({ total: 24, natural: 20, crit: true, expression: '1d20 + @{x}' });
    expect(r.parts.map((p) => [p.label, p.total])).toEqual([
      ['Daño de fuego ×2 dados', 25],
      ['Daño de frío ×2 dados', 8],
      ['Curación', 3],
    ]);
    expect(r).toMatchObject({ damage: 33, heal: 3, dc: 12, damageTypes: ['fuego', 'frío'] });
    // Conjuro lanzado dos niveles por encima.
    const spell = homebrewDataSchema.parse({ level: 3, damage: [{ dice: '8d6', type: 'fuego' }], upcast: '1d6' });
    expect(rollHomebrew(spell, { resolve: () => undefined, rng: fixed(0), castLevel: 5, kind: 'spell' }).parts[0]).toMatchObject({ expression: '10d6', total: 10 });
  });

  it('filas enlazadas para la hoja según el tipo', () => {
    const fireball = entry('spell', { level: 3, damage: [{ dice: '8d6', type: 'fuego' }], uses: 1, recharge: 'largo' }, 'Bola de fuego');
    expect(homebrewRows(t5e, fireball)).toEqual([
      { list: 'conjuros', row: { nivel: 3, nombre: 'Bola de fuego', preparado: false, efecto: '8d6 fuego', notas: '', _ref: 'h1' } },
      { list: 'recursos', row: { nombre: 'Bola de fuego', usos: 1, max: 1, recarga: 'largo', _ref: 'h1' } },
    ]);
    const sword = entry('item', { attack: 'melee', attackBonus: '5', critFrom: 19, weight: 3, damage: [{ dice: '1d8', type: 'cortante' }, { dice: '1d6', type: 'fuego' }] }, 'Espada');
    const rows = homebrewRows(t5e, sword);
    expect(rows.map((r) => r.list)).toEqual(['ataques', 'inventario']);
    expect(rows[0]!.row).toMatchObject({ nombre: 'Espada', bono: '+5', dano: '1d8 cortante', extra: '1d6 fuego', critico: 19, _ref: 'h1' });
    expect(rows[1]!.row).toMatchObject({ objeto: 'Espada', cantidad: 1, peso: 3 });
    // Ataque con salvación: la CD se calcula con la hoja si se pasa.
    const breath = entry('attack', { save: 'des', saveDc: '@{conj_cd}', damage: [{ dice: '2d6', type: 'fuego' }] });
    expect(homebrewRows(t5e, breath, { int: 16, nivel: 1, conj_caracteristica: 'int' })[0]!.row.bono).toBe('CD 13 DES');
  });

  it('resumen legible', () => {
    const s = entry('spell', { level: 3, school: 'Evocación', save: 'des', saveDc: '15', damage: [{ dice: '8d6', type: 'fuego' }], upcast: '1d6', area: { shape: 'circle', size: 20 }, conditions: ['derribado'] });
    expect(homebrewSummary(s, { saveLabel: 'Destreza', statusLabel: (id) => id.toUpperCase() })).toBe(
      'Nivel 3 de evocación · Salvación de Destreza CD 15 (mitad) · 8d6 fuego · +1d6 por nivel superior · Esfera / círculo de 20 pies · DERRIBADO',
    );
  });

  it('copia conjuros y objetos del SRD', () => {
    const fireball: SrdSpell = {
      id: 'fireball',
      name: 'Bola de fuego',
      en: 'Fireball',
      level: 3,
      school: 'Evocación',
      time: '1 acción',
      range: '150 pies',
      components: 'V, S, M',
      duration: 'Instantánea',
      concentration: false,
      ritual: false,
      classes: ['wizard'],
      save: 'des',
      damage: [{ type: 'fuego', bySlot: { '3': '8d6', '4': '9d6', '5': '10d6' } }],
      area: 'esfera de 20 pies',
      desc: 'A creature takes 8d6 fire damage on a failed save, or half as much damage on a successful one.',
    };
    const fb = homebrewFromSrdSpell(fireball, actionsOf(t5e));
    expect(fb).toMatchObject({ kind: 'spell', name: 'Bola de fuego', data: { level: 3, save: 'des', saveDc: '@{conj_cd}', saveHalf: true, damage: [{ dice: '8d6', type: 'fuego' }], upcast: '1d6', area: { shape: 'circle', size: 20 } } });
    expect(createHomebrewSchema.safeParse(fb).success).toBe(true);
    const cure: SrdSpell = { ...fireball, id: 'cure', name: 'Curar heridas', level: 1, save: undefined, damage: undefined, area: undefined, heal: { '1': '1d8 + MOD', '2': '2d8 + MOD' }, concentration: false, desc: '' };
    expect(homebrewFromSrdSpell(cure, actionsOf(t5e)).data).toMatchObject({ heal: '1d8 + @{conj_mod}', upcast: '1d8' });

    const rapier: SrdItem = { id: 'rapier', name: 'Estoque', en: 'Rapier', cat: 'arma', weight: 2, weapon: { martial: true, ranged: false, damage: '1d8', type: 'perforante', props: ['sutil'], finesse: true } };
    expect(homebrewFromSrdItem(rapier, t5e).data).toMatchObject({ attack: 'melee', attackBonus: '@{competencia} + max(@{fue_mod}, @{des_mod})', damage: [{ dice: '1d8 + max(@{fue_mod}, @{des_mod})', type: 'perforante' }] });
    expect(parseSrdArea('cono de 15 pies')).toEqual({ shape: 'cone', size: 15 });
    expect(parseSrdArea(undefined)).toEqual({ shape: 'none', size: 0 });
  });

  it('daño y curación en la hoja (primero los PG temporales)', () => {
    const v = { pg_actuales: 10, pg_temporales: 4, pg_max: 20 };
    expect(damagePatch(t5e, v, 7)).toEqual({ patch: { pg_temporales: 0, pg_actuales: 7 }, before: 10, after: 7, temp: 0 });
    expect(damagePatch(t5e, v, 99)?.after).toBe(0);
    expect(healPatch(t5e, v, 15)).toEqual({ patch: { pg_actuales: 20 }, before: 10, after: 20 });
    // Otra plantilla: usa su propio campo de vida (y sin temporales).
    expect(damagePatch(BUILTIN_TEMPLATES.generic!.template, { vida: 5 }, 3)).toMatchObject({ patch: { vida: 2 }, after: 2 });
  });

  it('tokens dentro de una plantilla', () => {
    const g = 70;
    const tok = (col: number, row: number, size = 1) => ({ id: `${col},${row}`, x: col * g, y: row * g, width: size * g, height: size * g });
    const circle = { shape: 'circle' as const, points: [{ x: 0, y: 0 }, { x: 2 * g, y: 0 }] };
    expect(itemsInArea(circle, [tok(0, 0), tok(1, 0), tok(1, 1), tok(3, 0)], g).map((t) => t.id)).toEqual(['0,0', '1,0']);
    // Un token grande cuenta si alguna de sus casillas cae dentro.
    expect(itemsInArea(circle, [tok(1, -2, 2)], g)).toHaveLength(1);
  });
});
