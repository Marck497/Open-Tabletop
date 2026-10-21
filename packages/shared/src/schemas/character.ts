import { z } from 'zod';
import type { SheetValues } from './sheet.js';

export interface Character {
  id: string;
  campaignId: string;
  name: string;
  avatarAssetId: string | null;
  /** Jugadores que controlan (y pueden editar) este personaje. */
  controlledBy: string[];
  /** Si es true, todos los jugadores pueden ver la hoja (solo lectura). */
  visibleToAll: boolean;
  values: SheetValues;
  updatedAt: string;
}

const sheetValueSchema = z.union([
  z.string().max(20000),
  z.number(),
  z.boolean(),
  z.array(z.object({ _id: z.string().min(1).max(64) }).catchall(z.union([z.string().max(5000), z.number(), z.boolean()]))).max(500),
]);

export const createCharacterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  controlledBy: z.array(z.string()).max(50).default([]),
  visibleToAll: z.boolean().default(false),
});
export type CreateCharacterInput = z.input<typeof createCharacterSchema>;

export const updateCharacterSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  avatarAssetId: z.string().nullable().optional(),
  controlledBy: z.array(z.string()).max(50).optional(),
  visibleToAll: z.boolean().optional(),
  /** Solo se envían los campos que cambian; se fusionan con los guardados. */
  values: z.record(z.string().max(48), sheetValueSchema).optional(),
});
export type UpdateCharacterInput = z.input<typeof updateCharacterSchema>;
