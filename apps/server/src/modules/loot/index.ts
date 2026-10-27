import { randomUUID } from 'node:crypto';
import {
  tr,
  actionsOf,
  coinsOf,
  evaluate,
  ExprError,
  homebrewRows,
  lootPatch,
  lootSchema,
  rowFor,
  splitEvenly,
  type ChatMessage,
  type ChatRollPart,
  type LootInput,
  type PublicUser,
} from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { handleAck } from '../../core/socket-utils.js';
import { createCampaignService } from '../campaigns/service.js';
import { broadcastMessage } from '../chat/index.js';
import { createChatService } from '../chat/service.js';
import { secureRng } from '../dice/service.js';
import { createHomebrewService } from '../homebrew/service.js';
import { broadcastCharacter } from '../sheets/index.js';
import { createSheetService } from '../sheets/service.js';

/**
 * Botín y tesoro: el DM reparte objetos (al inventario, sumando si ya los tiene) y monedas
 * (tiradas en el servidor si son dados) a las hojas de los personajes, y se anuncia en el chat.
 */
export function createLootService(ctx: AppContext) {
  const campaigns = createCampaignService(ctx);
  const sheets = createSheetService(ctx);
  const homebrew = createHomebrewService(ctx);
  const chat = createChatService(ctx);

  async function give(user: PublicUser, input: LootInput): Promise<ChatMessage> {
    const loot = lootSchema.parse(input);
    const { campaignId } = loot;
    campaigns.requireGm(campaignId, user.id);
    const template = sheets.getTemplate(campaignId);
    const inv = actionsOf(template).inventory;
    if (loot.items.length && !inv) throw badRequest('La hoja no tiene inventario (revisa la plantilla)');

    const ids = [...new Set([...loot.characterIds, ...loot.items.map((i) => i.to)])];
    const characters = ids.map((id) => {
      try {
        const c = sheets.row(id);
        if (c.campaignId !== campaignId) throw new Error();
        return c;
      } catch {
        throw badRequest('Personaje no encontrado');
      }
    });

    // Monedas: se tiran una vez y se reparten (o cada uno recibe lo mismo).
    const parts: ChatRollPart[] = [];
    const share = new Map<string, Record<string, number>>(ids.map((id) => [id, {}]));
    for (const c of coinsOf(template)) {
      const text = loot.coins[c.key]?.trim();
      if (!text || !loot.characterIds.length) continue;
      let total: number;
      try {
        const r = evaluate(text, { rng: secureRng });
        total = Math.max(0, Math.floor(r.value));
        if (r.rolls.length) parts.push({ label: `${c.label} (${text})`, expression: text, total, rolls: r.rolls });
      } catch (e) {
        if (e instanceof ExprError) throw badRequest('{label}: tirada no válida ({error})', { label: c.label, error: e.message });
        throw e;
      }
      if (!total) continue;
      const amounts = loot.coinMode === 'each' ? loot.characterIds.map(() => total) : splitEvenly(total, loot.characterIds.length);
      loot.characterIds.forEach((id, i) => (share.get(id)![c.key] = amounts[i]!));
    }

    const lines: string[] = [];
    for (const character of characters) {
      const items = loot.items
        .filter((i) => i.to === character.id)
        .map((i) => {
          const entry = i.entryId ? homebrew.find(campaignId, i.entryId) : null;
          const rows = entry
            ? homebrewRows(template, entry, character.values)
            : inv
              ? [{ list: inv.list, row: rowFor(template, inv.list, { [inv.name]: i.name, [inv.qty]: i.qty, ...(inv.weight && i.weight !== undefined ? { [inv.weight]: i.weight } : {}) }) }]
              : [];
          return { name: entry?.name ?? i.name, qty: i.qty, entryId: entry ? entry.id : null, rows };
        });
      const { patch, got } = lootPatch(template, character.values, { items, coins: share.get(character.id) ?? {} }, () => randomUUID().slice(0, 8));
      if (!got.length) continue;
      const { before, after } = sheets.update(character.id, user.id, { values: patch });
      await broadcastCharacter(ctx, before, after);
      lines.push(`${character.name}: ${got.join(', ')}`);
    }
    if (!lines.length) throw badRequest('No hay nada que repartir');

    return chat.insert({
      campaignId,
      userId: user.id,
      userName: user.displayName,
      characterId: null,
      characterName: null,
      kind: parts.length ? 'roll' : 'system',
      text: tr('💰 Botín\n{0}', { '0': lines.join('\n') }),
      roll: parts.length ? { label: tr('💰 Tesoro'), expression: '', total: parts.reduce((s, p) => s + p.total, 0), rolls: [], parts } : null,
      whisperTo: null,
      secret: false,
    });
  }

  return { give };
}

export const lootModule: ServerModule = {
  name: 'loot',
  socket(socket, ctx) {
    const loot = createLootService(ctx);
    socket.on('loot:give', (payload, ack) =>
      handleAck(ack, async () => {
        const message = await loot.give(socket.data.user, payload);
        await broadcastMessage(ctx, message);
        return message;
      }),
    );
  },
};
