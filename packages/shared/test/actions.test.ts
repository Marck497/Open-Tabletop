import { describe, expect, it } from 'vitest';
import {
  actionsOf,
  BUILTIN_TEMPLATES,
  DND5E_VERSION,
  restPatch,
  sheetTemplateSchema,
  slotsOf,
  spendSlot,
  spendUse,
  splitRoll,
  upgradeDnd5e,
  type SheetTemplate,
  type SheetValues,
} from '../src/index.js';

const t5e = BUILTIN_TEMPLATES.dnd5e!.template;

/** Plantilla 5e como se guardaba antes (versión 1): sin recursos, sin columnas de extra/crítico ni mapeo de conjuros. */
function v1(): SheetTemplate {
  const t = structuredClone(t5e);
  t.version = 1;
  t.sections = t.sections.filter((s) => s.id !== 'recursos');
  for (const s of t.sections) {
    s.fields = s.fields.filter((f) => f.key !== 'espacios_pacto');
    for (const f of s.fields) if (f.key === 'ataques') f.columns = f.columns!.filter((c) => c.key !== 'extra' && c.key !== 'critico');
  }
  t.combat = { ...t.combat!, attacks: { list: 'ataques', name: 'nombre', attack: 'bono', damage: 'dano' } };
  delete t.combat.spells;
  delete t.combat.slots;
  delete t.combat.resources;
  return sheetTemplateSchema.parse(t);
}

describe('acciones de la hoja', () => {
  it('la plantilla de serie trae todo y las antiguas usan lo que tienen', () => {
    const a = actionsOf(t5e);
    expect(a.attacks).toMatchObject({ list: 'ataques', extra: 'extra', crit: 'critico' });
    expect(a.spells?.list).toBe('conjuros');
    expect(a.slots?.pact).toBe('espacios_pacto');
    expect(a.resources?.list).toBe('recursos');
    const old = actionsOf(v1());
    expect(old.attacks?.extra).toBeUndefined();
    expect(old.spells?.list).toBe('conjuros'); // las columnas existen: se usa el de serie
    expect(old.resources).toBeNull(); // no hay tabla de recursos
  });

  it('pone al día una plantilla 5e antigua solo con lo que falta, una vez', () => {
    const up = upgradeDnd5e(v1());
    expect(up.version).toBe(DND5E_VERSION);
    expect(up.sections.find((s) => s.id === 'recursos')).toBeTruthy();
    expect(up.sections.flatMap((s) => s.fields).find((f) => f.key === 'ataques')!.columns!.map((c) => c.key)).toEqual(['nombre', 'bono', 'dano', 'tipo', 'extra', 'critico']);
    expect(actionsOf(up).resources?.list).toBe('recursos');
    expect(sheetTemplateSchema.safeParse(up).success).toBe(true);
    expect(upgradeDnd5e(up)).toBe(up);
    // Si el DM quita la sección después, no vuelve.
    const edited = { ...up, sections: up.sections.filter((s) => s.id !== 'recursos') };
    expect(upgradeDnd5e(edited)).toBe(edited);
    // Plantillas de otros sistemas: intactas.
    const other = { ...v1(), name: 'Mi sistema' };
    expect(upgradeDnd5e(other)).toBe(other);
  });

  const values: SheetValues = {
    pg_max: 20,
    pg_actuales: 5,
    pg_temporales: 3,
    espacios_1_max: 4,
    espacios_1_usados: 4,
    espacios_2_max: 2,
    espacios_2_usados: 1,
    recursos: [
      { _id: 'r1', nombre: 'Furia', usos: 0, max: 3, recarga: 'largo' },
      { _id: 'r2', nombre: 'Ki', usos: 1, max: 4, recarga: 'corto' },
      { _id: 'r3', nombre: 'Varita', usos: 2, max: 7, recarga: '' },
    ],
  };

  it('gasta espacios: el más bajo libre o el elegido', () => {
    expect(slotsOf(t5e, values).slice(0, 2)).toEqual([
      { level: 1, max: 4, used: 4 },
      { level: 2, max: 2, used: 1 },
    ]);
    expect(spendSlot(t5e, values, 1)).toMatchObject({ slot: 2, left: 0, max: 2, patch: { espacios_2_usados: 2 } });
    expect(() => spendSlot(t5e, values, 1, 1)).toThrow('No te quedan espacios de nivel 1');
    expect(() => spendSlot(t5e, values, 2, 1)).toThrow('No se puede lanzar');
    expect(() => spendSlot(t5e, values, 3)).toThrow('nivel 3 o superior');
  });

  it('gasta usos de recursos', () => {
    expect(spendUse(t5e, values, 'r2')).toMatchObject({ name: 'Ki', left: 0, max: 4 });
    expect(() => spendUse(t5e, values, 'r1')).toThrow('No te quedan usos de Furia');
  });

  it('descanso largo y corto (con espacios de pacto)', () => {
    const long = restPatch(t5e, values, 'long');
    expect(long.patch).toMatchObject({ pg_actuales: 20, pg_temporales: 0, espacios_1_usados: 0, espacios_2_usados: 0 });
    expect((long.patch.recursos as unknown as { usos: number }[]).map((r) => r.usos)).toEqual([3, 4, 2]);
    expect(long.recovered).toEqual(['los PG', 'los espacios de conjuro', 'Furia, Ki']);
    const short = restPatch(t5e, values, 'short');
    expect(short.patch.pg_actuales).toBeUndefined();
    expect(short.patch.espacios_1_usados).toBeUndefined();
    expect((short.patch.recursos as unknown as { usos: number }[]).map((r) => r.usos)).toEqual([0, 4, 2]);
    const pact = restPatch(t5e, { ...values, espacios_pacto: true }, 'short');
    expect(pact.patch).toMatchObject({ espacios_1_usados: 0, espacios_2_usados: 0 });
    expect(pact.recovered[0]).toBe('los espacios de pacto');
  });

  it('separa el tipo de daño de la tirada', () => {
    expect(splitRoll('1d6 fuego')).toEqual({ expression: '1d6', label: 'fuego' });
    expect(splitRoll('1d8 + 3 cortante')).toEqual({ expression: '1d8 + 3', label: 'cortante' });
    expect(splitRoll('2d6+@{fue_mod}')).toEqual({ expression: '2d6+@{fue_mod}', label: '' });
  });
});
