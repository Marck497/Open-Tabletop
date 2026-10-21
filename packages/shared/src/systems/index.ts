import { sheetTemplateSchema, type SheetTemplate } from '../schemas/sheet.js';
import { dnd5eTemplate } from './dnd5e.js';
import { genericTemplate } from './generic.js';

/** Plantillas incluidas de serie. Se copian a cada partida, donde el DM puede editarlas. */
export const BUILTIN_TEMPLATES: Record<string, { label: string; template: SheetTemplate }> = {
  dnd5e: { label: 'D&D 5e', template: sheetTemplateSchema.parse(dnd5eTemplate) },
  generic: { label: 'Genérico (vacío)', template: sheetTemplateSchema.parse(genericTemplate) },
};

export const DEFAULT_TEMPLATE_ID = 'dnd5e';
