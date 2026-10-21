import { randomInt } from 'node:crypto';
import { createResolver, evaluate, ExprError, type ChatRoll, type PublicUser, type RollRequest, type SheetRow } from '@vtt/shared';
import { z } from 'zod';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden } from '../../core/errors.js';
import { createCampaignService } from '../campaigns/service.js';
import { canEditCharacter, createSheetService } from '../sheets/service.js';

/** Aleatoriedad criptográfica: nadie puede predecir las tiradas. */
const secureRng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export const rollRequestSchema = z.object({
  campaignId: z.string(),
  expression: z.string().trim().min(1).max(500),
  label: z.string().trim().max(120).optional(),
  characterId: z.string().nullish(),
  row: z.object({ listKey: z.string(), rowId: z.string() }).nullish(),
  secret: z.boolean().optional(),
  toInitiative: z.boolean().optional(),
});

export interface RollOutcome {
  roll: ChatRoll;
  characterId: string | null;
  characterName: string | null;
}

/** Todas las tiradas se resuelven en el servidor. */
export function createDiceService(ctx: AppContext) {
  const campaigns = createCampaignService(ctx);
  const sheets = createSheetService(ctx);

  function roll(user: PublicUser, input: RollRequest): RollOutcome {
    const req = rollRequestSchema.parse(input);
    campaigns.requireMember(req.campaignId, user.id);

    let resolve: ((name: string) => unknown) | undefined;
    let characterName: string | null = null;
    if (req.characterId) {
      const { character, role } = sheets.access(req.characterId, user.id);
      if (character.campaignId !== req.campaignId) throw badRequest('Personaje de otra partida');
      if (!canEditCharacter(character, role, user.id)) throw forbidden('No puedes tirar por este personaje');
      const rows = req.row ? character.values[req.row.listKey] : undefined;
      const row = Array.isArray(rows) ? (rows.find((r) => r._id === req.row!.rowId) as SheetRow | undefined) : undefined;
      resolve = createResolver(sheets.getTemplate(req.campaignId), character.values, row);
      characterName = character.name;
    }

    try {
      const { value, rolls } = evaluate(req.expression, { resolve, rng: secureRng });
      return {
        roll: { label: req.label ?? '', expression: req.expression, total: value, rolls },
        characterId: req.characterId ?? null,
        characterName,
      };
    } catch (e) {
      if (e instanceof ExprError) throw badRequest(`Tirada no válida: ${e.message}`);
      throw e;
    }
  }

  return { roll };
}
