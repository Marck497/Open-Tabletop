import { sheetTemplateSchema, type CombatMapping, type SheetTemplate, type StatusDef } from '../schemas/sheet.js';
import { dnd5eTemplate } from './dnd5e.js';
import { DND5E_STATUSES } from './statuses.js';
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
  return template?.statuses ?? DND5E_STATUSES;
}

export { DND5E_STATUSES, GENERIC_STATUSES } from './statuses.js';
