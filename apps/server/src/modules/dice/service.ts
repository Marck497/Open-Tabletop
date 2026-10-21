import { randomInt, randomUUID } from 'node:crypto';
import { createResolver, evaluate, ExprError, type RollRequest, type RollResult, type SheetRow } from '@vtt/shared';
import { z } from 'zod';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden } from '../../core/errors.js';
import type { PublicUser } from '@vtt/shared';
import { createCampaignService } from '../campaigns/service.js';
import { canEditCharacter, createSheetService } from '../sheets/service.js';

/** Aleatoriedad criptográfica: nadie puede predecir las tiradas. */
const secureRng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const rollRequestSchema = z.object({
  campaignId: z.string(),
  expression: z.string().trim().min(1).max(500),
  label: z.string().trim().max(120).optional(),
  characterId: z.string().nullish(),
  row: z.object({ listKey: z.string(), rowId: z.string() }).nullish(),
  secret: z.boolean().optional(),
});

/** Todas las tiradas se resuelven en el servidor. */
export function createDiceService(ctx: AppContext) {
  const campaigns = createCampaignService(ctx);
  const sheets = createSheetService(ctx);

  function roll(user: PublicUser, input: RollRequest): RollResult {
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
        id: randomUUID(),
        campaignId: req.campaignId,
        userId: user.id,
        userName: user.displayName,
        characterId: req.characterId ?? null,
        characterName,
        label: req.label ?? '',
        expression: req.expression,
        total: value,
        rolls,
        secret: req.secret ?? false,
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      if (e instanceof ExprError) throw badRequest(`Tirada no válida: ${e.message}`);
      throw e;
    }
  }

  return { roll };
}
