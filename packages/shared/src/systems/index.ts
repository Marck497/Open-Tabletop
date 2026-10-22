import { allFields, createResolver, sheetTemplateSchema, type CombatMapping, type SheetField, type SheetTemplate, type SheetValues, type StatusDef } from '../schemas/sheet.js';
import { dnd5eTemplate } from './dnd5e.js';
import { DND5E_STATUSES, GENERIC_STATUSES } from './statuses.js';
import { genericTemplate } from './generic.js';

/** Plantillas incluidas de serie. Se copian a cada partida, donde el DM puede editarlas. */
export const BUILTIN_TEMPLATES: Record<string, { label: string; template: SheetTemplate }> = {
  dnd5e: { label: 'D&D 5e', template: sheetTemplateSchema.parse(dnd5eTemplate) },
  generic: { label: 'Genérico (vacío)', template: sheetTemplateSchema.parse(genericTemplate) },
};

export const DEFAULT_TEMPLATE_ID = 'dnd5e';

/**
 * Campos de combate de una plantilla. Las plantillas guardadas antes de existir esta
 * opción no la traen: se usa la de serie cuyos campos existan todos en la plantilla.
 */
export function combatOf(template: SheetTemplate): CombatMapping | null {
  if (template.combat) return template.combat;
  const keys = new Set(template.sections.flatMap((s) => s.fields.map((f) => f.key)));
  for (const { template: builtin } of Object.values(BUILTIN_TEMPLATES)) {
    const c = builtin.combat;
    if (c && [c.hp, c.attacks?.list].filter(Boolean).every((k) => keys.has(k!))) return c;
  }
  return null;
}

/** Estados de los tokens de una plantilla (las guardadas antes de existir la opción usan los de 5e). */
export function statusesOf(template: SheetTemplate | null): StatusDef[] {
  const list = template?.statuses ?? DND5E_STATUSES;
  // Plantillas guardadas antes de que existieran los bufos: se completa el tipo con el de las condiciones conocidas.
  // Igual con las resistencias que dan (furia, petrificado...).
  return list.map((d) => ({
    ...d,
    ...(d.kind ? {} : { kind: KNOWN.get(d.id)?.kind }),
    ...(d.resist === undefined && KNOWN.get(d.id)?.resist ? { resist: KNOWN.get(d.id)!.resist } : {}),
    ...(d.concentration === undefined && KNOWN.get(d.id)?.concentration ? { concentration: KNOWN.get(d.id)!.concentration } : {}),
  }));
}

const KNOWN = new Map([...GENERIC_STATUSES, ...DND5E_STATUSES].map((d) => [d.id, d]));

/** Campo de iniciativa de la plantilla (el marcado "iniciativa"). */
export function initiativeFieldOf(template: SheetTemplate): SheetField | undefined {
  return allFields(template).find((f) => f.initiative);
}

/**
 * Cómo se tira la iniciativa de una hoja: la tirada del campo de iniciativa (o 1d20 + su valor)
 * y su bono, que sirve para desempatar. Sin hoja o sin campo, 1d20 a secas.
 */
export function initiativeRollOf(template: SheetTemplate | null, values: SheetValues | null): { expression: string; bonus: number; resolve?: (name: string) => unknown } {
  const field = template && initiativeFieldOf(template);
  if (!template || !values || !field) return { expression: '1d20', bonus: 0 };
  const resolve = createResolver(template, values);
  const bonus = Number(resolve(field.key));
  return { expression: field.roll || `1d20 + @{${field.key}}`, bonus: Number.isFinite(bonus) ? bonus : 0, resolve };
}

export { DND5E_STATUSES, GENERIC_STATUSES } from './statuses.js';
export { DND5E_VERSION, RECHARGE_OPTIONS, upgradeDnd5e } from './dnd5e.js';
