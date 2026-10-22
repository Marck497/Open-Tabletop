import { z } from 'zod';

/**
 * Macros: botones con una o varias líneas de chat (tiradas, comandos, texto)
 * para no tener que escribirlas cada vez.
 */
export interface Macro {
  id: string;
  campaignId: string;
  /** Quién la creó. Si `shared`, la ve toda la mesa (solo el DM puede compartir). */
  ownerId: string;
  shared: boolean;
  name: string;
  /** Una línea por mensaje: "/r 1d20 + @{fue_mod} Ataque", "/em desenvaina", texto... */
  command: string;
  /** Personaje con el que se tira (sus @{campos}); null = el del token seleccionado o tú. */
  characterId: string | null;
  /** Aparece en la barra de macros. */
  inBar: boolean;
  sortOrder: number;
}

export const MAX_MACRO_LINES = 10;

export const macroInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  command: z
    .string()
    .max(2000)
    .refine((c) => macroLines(c).length > 0, 'La macro está vacía')
    .refine((c) => macroLines(c).length <= MAX_MACRO_LINES, `Como mucho ${MAX_MACRO_LINES} líneas`),
  characterId: z.string().nullable(),
  shared: z.boolean(),
  inBar: z.boolean(),
  sortOrder: z.number().int(),
});
export const createMacroSchema = macroInputSchema.partial().extend({ name: macroInputSchema.shape.name, command: macroInputSchema.shape.command });
export const updateMacroSchema = macroInputSchema.partial();
export type CreateMacroInput = z.input<typeof createMacroSchema>;
export type UpdateMacroInput = z.input<typeof updateMacroSchema>;

/** Líneas que se envían al chat (las vacías se ignoran). */
export function macroLines(command: string): string[] {
  return command
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
