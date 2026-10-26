import { z } from 'zod';

/**
 * Encuentros preparados: grupos de monstruos del compendio que el DM guarda en la partida
 * («Emboscada goblin») y suelta en el tablero con un clic, cada uno con su hoja y su IA.
 * Solo los ve el DM.
 */

/** Como mucho, cuántos monstruos se sueltan de una vez (cada uno crea una hoja). */
export const MAX_ENCOUNTER_MONSTERS = 40;

export const encounterMonsterSchema = z.object({
  monsterId: z.string().min(1).max(64),
  count: z.number().int().min(1).max(MAX_ENCOUNTER_MONSTERS),
});
export type EncounterMonster = z.infer<typeof encounterMonsterSchema>;

const monstersSchema = z
  .array(encounterMonsterSchema)
  .max(30)
  .refine((list) => list.reduce((n, m) => n + m.count, 0) <= MAX_ENCOUNTER_MONSTERS, `Como mucho ${MAX_ENCOUNTER_MONSTERS} monstruos por encuentro`);

export const encounterInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Notas del DM: dónde, cómo se comportan, qué botín llevan… */
  notes: z.string().max(5000).default(''),
  monsters: monstersSchema.default([]),
});
export const updateEncounterSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  notes: z.string().max(5000).optional(),
  monsters: monstersSchema.optional(),
});
export type EncounterInput = z.input<typeof encounterInputSchema>;
export type UpdateEncounterInput = z.input<typeof updateEncounterSchema>;

export interface Encounter {
  id: string;
  campaignId: string;
  name: string;
  notes: string;
  monsters: EncounterMonster[];
  createdAt: string;
}

/** Soltar un encuentro: en qué escena y alrededor de qué punto (en píxeles); `hidden` los pone en la capa del DM. */
export const deployEncounterSchema = z.object({
  sceneId: z.string().min(1).max(64),
  x: z.number().finite(),
  y: z.number().finite(),
  hidden: z.boolean().default(false),
});
export type DeployEncounterInput = z.input<typeof deployEncounterSchema>;
