import { z } from 'zod';
import { createItemSchema, fogSchema, sceneInputSchema } from './board.js';
import { terrainSchema } from './terrain.js';
import { updateCharacterSchema } from './character.js';
import { handoutInputSchema } from './journal.js';
import { macroInputSchema } from './macro.js';
import { createHomebrewSchema } from './homebrew.js';
import { encounterInputSchema } from './encounter.js';
import { sheetTemplateSchema } from './sheet.js';
import { wallsSchema } from './walls.js';

/**
 * Copia de seguridad de una partida: un JSON (comprimido con gzip) con escenas, tokens,
 * hojas, diario, macros, creaciones, música y, si se pide, los archivos subidos. Las referencias a
 * usuarios no se guardan (al restaurar en otro servidor no existen): quien la restaura
 * queda como DM y vuelve a invitar a los jugadores.
 */
export const BACKUP_FORMAT = 'vtt-backup';
export const BACKUP_VERSION = 1;
/** Tamaño máximo de una copia al restaurarla. */
export const MAX_BACKUP_BYTES = 500 * 1024 * 1024;

const id = z.string().min(1).max(64);

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  campaign: z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(2000).default(''),
    systemId: z.string().min(1).max(64).default('dnd5e'),
    activeSceneId: id.nullable().default(null),
  }),
  template: sheetTemplateSchema.nullable().default(null),
  scenes: z
    .array(
      sceneInputSchema.partial().extend({
        id,
        name: sceneInputSchema.shape.name,
        sortOrder: z.number().int().default(0),
        fog: fogSchema.optional(),
        walls: wallsSchema.default([]),
        terrain: terrainSchema.default(''),
        folderId: id.nullable().default(null),
      }),
    )
    .max(500)
    .default([]),
  sceneFolders: z
    .array(z.object({ id, name: z.string().trim().min(1).max(80), parentId: id.nullable().default(null), sortOrder: z.number().int().default(0) }))
    .max(500)
    .default([]),
  items: z
    .array(createItemSchema.extend({ id, sceneId: id }))
    .max(50000)
    .default([]),
  characters: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(80),
        avatarAssetId: id.nullable().default(null),
        visibleToAll: z.boolean().default(false),
        values: updateCharacterSchema.shape.values.unwrap().default({}),
      }),
    )
    .max(5000)
    .default([]),
  handouts: z
    .array(handoutInputSchema.partial().extend({ id, title: handoutInputSchema.shape.title }))
    .max(5000)
    .default([]),
  macros: z
    .array(macroInputSchema.partial().extend({ id, name: macroInputSchema.shape.name, command: macroInputSchema.shape.command }))
    .max(2000)
    .default([]),
  /** Creaciones (hechizos, ataques, objetos): las compartidas y las del DM. */
  homebrew: z
    .array(createHomebrewSchema.extend({ id }))
    .max(5000)
    .default([]),
  /** Encuentros preparados (grupos de monstruos del compendio). */
  encounters: z
    .array(encounterInputSchema.extend({ id }))
    .max(1000)
    .default([]),
  jukebox: z
    .array(z.object({ id, assetId: id, name: z.string().max(200), volume: z.number().min(0).max(1), loop: z.boolean() }))
    .max(100)
    .default([]),
  assets: z
    .array(
      z.object({
        id,
        name: z.string().max(200),
        mime: z.string().max(100),
        /** Contenido en base64 (falta si la copia se hizo sin archivos). */
        data: z.string().optional(),
      }),
    )
    .max(10000)
    .default([]),
});
export type Backup = z.infer<typeof backupSchema>;
export type BackupInput = z.input<typeof backupSchema>;

/** Resumen de lo restaurado, para enseñárselo al DM. */
export interface ImportSummary {
  campaignId: string;
  scenes: number;
  items: number;
  characters: number;
  handouts: number;
  macros: number;
  homebrew: number;
  encounters: number;
  assets: number;
  /** Archivos que no se pudieron restaurar (formato no válido o faltaban). */
  skippedAssets: number;
}
