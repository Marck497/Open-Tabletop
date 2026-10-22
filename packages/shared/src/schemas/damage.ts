import { z } from 'zod';

/**
 * Daño y curación a mano: el DM elige tokens, escribe una cantidad (número o tirada, que se
 * tira en el servidor) y, si es daño, su tipo para que cuenten resistencias e inmunidades.
 */
export const DAMAGE_KINDS = ['damage', 'heal'] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];

export const manualDamageSchema = z.object({
  campaignId: z.string().min(1).max(64),
  itemIds: z.array(z.string().min(1).max(64)).min(1).max(50),
  kind: z.enum(DAMAGE_KINDS),
  /** "8", "2d6 + 3"... */
  amount: z.string().trim().min(1).max(100),
  /** Tipo de daño ('' = sin tipo). En la curación no se usa. */
  type: z.string().trim().max(40).default(''),
});
export type ManualDamageInput = z.input<typeof manualDamageSchema>;
