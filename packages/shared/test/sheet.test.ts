import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES } from '../src/systems/index.js';
import { computeAll, createResolver, defaultValues, sheetTemplateSchema } from '../src/schemas/sheet.js';
import { evaluate } from '../src/expr.js';

const dnd = BUILTIN_TEMPLATES.dnd5e!.template;

describe('plantilla D&D 5e', () => {
  it('es válida y sus fórmulas calculan bien', () => {
    const values = { ...defaultValues(dnd), fue: 16, des: 14, sab: 12, nivel: 5, atletismo_comp: true, sigilo_exp: true, sv_fue_comp: true };
    const c = computeAll(dnd, values);
    expect(c.fue_mod).toBe(3);
    expect(c.competencia).toBe(3);
    expect(c.atletismo).toBe(6);
    expect(c.sigilo).toBe(2 + 6);
    expect(c.sv_fue).toBe(6);
    expect(c.iniciativa).toBe(2);
    expect(c.percepcion_pasiva).toBe(11);
    expect(c.conj_cd).toBe(8 + 3 + 0);
  });

  it('las tiradas de filas usan los valores de la fila', () => {
    const values = { ...defaultValues(dnd), fue: 18 };
    const row = { _id: 'r1', nombre: 'Espada', bono: '+7', dano: '1d8 + @{fue_mod}' };
    const resolve = createResolver(dnd, values, row);
    expect(evaluate('1d20 + @{bono}', { resolve, rng: () => 0 }).value).toBe(8);
    expect(evaluate('@{dano}', { resolve, rng: () => 0 }).value).toBe(1 + 4);
  });

  it('rechaza claves repetidas', () => {
    const bad = { name: 'x', sections: [{ id: 's', title: 's', fields: [{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'B', type: 'text' }] }] };
    expect(sheetTemplateSchema.safeParse(bad).success).toBe(false);
  });

  it('los ciclos en fórmulas no cuelgan', () => {
    const t = sheetTemplateSchema.parse({
      name: 'c',
      sections: [{ id: 's', title: 's', fields: [{ key: 'a', label: 'A', type: 'computed', formula: 'b + 1' }, { key: 'b', label: 'B', type: 'computed', formula: 'a + 1' }] }],
    });
    expect(() => computeAll(t, {})).not.toThrow();
  });
});
