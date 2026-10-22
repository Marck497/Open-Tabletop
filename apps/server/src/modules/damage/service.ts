import { and, inArray } from 'drizzle-orm';
import {
  applyDefenses,
  damagePatch,
  defensesOf,
  evaluate,
  ExprError,
  healPatch,
  manualDamageSchema,
  type BoardItem,
  type Character,
  type ChatMessage,
  type DamagePiece,
  type ManualDamageInput,
  type PublicUser,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { boardItems } from '../../db/schema.js';
import { createBoardService } from '../board/service.js';
import { createCampaignService } from '../campaigns/service.js';
import { createChatService } from '../chat/service.js';
import { secureRng } from '../dice/service.js';
import { broadcastCharacter } from '../sheets/index.js';
import { createSheetService } from '../sheets/service.js';

/**
 * Daño y curación a las hojas de los tokens. Lo usan 🎯 Aplicar (creaciones) y el daño a mano del
 * DM: primero las defensas (resistencias, inmunidades...), luego los PG temporales. La
 * concentración se entera sola porque `broadcastCharacter` avisa cuando una hoja pierde vida.
 */
export function createDamageService(ctx: AppContext) {
  const { db } = ctx;
  const board = createBoardService(ctx);
  const sheets = createSheetService(ctx);
  const campaigns = createCampaignService(ctx);
  const chat = createChatService(ctx);

  /** Tokens de las escenas de la partida (los que existan de esa lista), en el orden pedido. */
  function itemsOf(campaignId: string, ids: string[]): BoardItem[] {
    const scenes = board.sceneIdsOf(campaignId);
    if (!ids.length || !scenes.length) return [];
    const found = db
      .select({ id: boardItems.id, sceneId: boardItems.sceneId })
      .from(boardItems)
      .where(and(inArray(boardItems.id, ids), inArray(boardItems.sceneId, scenes)))
      .all();
    found.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return found.map((f) => board.itemsOf(f.sceneId).items.find((i) => i.id === f.id)!).filter(Boolean);
  }

  /** Hoja vinculada al token, si la tiene. */
  function characterOf(item: BoardItem): Character | null {
    if (!item.characterId) return null;
    try {
      return sheets.row(item.characterId);
    } catch {
      return null;
    }
  }

  /** Daño por tipos a la hoja (o a nada, si el token no tiene). Devuelve el total y el texto para el chat. */
  async function hurt(user: PublicUser, campaignId: string, item: BoardItem, character: Character | null, pieces: DamagePiece[]) {
    const template = sheets.getTemplate(campaignId);
    const defended = applyDefenses(pieces, defensesOf(template, character?.values ?? null, item.statuses));
    const damage = defended.total;
    const why = defended.notes.length ? ` (${defended.notes.join(', ')})` : '';
    if (damage <= 0) return { damage, text: `sin daño${why}`, character };
    const p = character ? damagePatch(template, character.values, damage) : null;
    if (!character || !p) return { damage, text: `${damage} de daño${why} (sin hoja)`, character };
    const isPc = character.controlledBy.length > 0;
    const after = sheets.update(character.id, user.id, { values: p.patch }).after;
    await broadcastCharacter(ctx, character, after);
    return { damage, text: `${damage} de daño${why}${isPc ? ` (${p.before} → ${p.after})` : p.after === 0 ? ' (cae a 0)' : ''}`, character: after };
  }

  /** Curación a la hoja (sin pasar del máximo). */
  async function heal(user: PublicUser, campaignId: string, item: BoardItem, character: Character | null, amount: number) {
    const template = sheets.getTemplate(campaignId);
    const p = character ? healPatch(template, character.values, amount) : null;
    if (!character || !p) return { text: `cura ${amount} (sin hoja)`, character };
    const isPc = character.controlledBy.length > 0;
    const after = sheets.update(character.id, user.id, { values: p.patch }).after;
    await broadcastCharacter(ctx, character, after);
    return { text: `recupera ${p.after - p.before} PG${isPc ? ` (${p.before} → ${p.after})` : ''}`, character: after };
  }

  /** Solo el DM: daño o curación a mano a unos tokens. La cantidad se tira aquí si lleva dados. */
  async function applyManual(user: PublicUser, input: ManualDamageInput): Promise<ChatMessage> {
    const { campaignId, itemIds, kind, amount, type } = manualDamageSchema.parse(input);
    campaigns.requireGm(campaignId, user.id);
    const items = itemsOf(campaignId, [...new Set(itemIds)]);
    if (!items.length) throw badRequest('Elige los tokens: selecciona uno o coloca la plantilla de área encima');

    let roll;
    try {
      roll = evaluate(amount, { rng: secureRng });
    } catch (e) {
      if (e instanceof ExprError) throw badRequest(`Cantidad no válida (${e.message}). Escribe un número o una tirada como 2d6 + 3`);
      throw e;
    }
    const total = Math.round(roll.value);
    if (!(total > 0)) throw badRequest('La cantidad tiene que ser mayor que 0');

    const lines: string[] = [];
    for (const item of items) {
      const character = characterOf(item);
      const name = item.name || character?.name || 'Token';
      const r = kind === 'heal' ? await heal(user, campaignId, item, character, total) : await hurt(user, campaignId, item, character, [{ type, amount: total }]);
      lines.push(`${name}: ${r.text}`);
    }

    const targets = `${items.length} token${items.length > 1 ? 's' : ''}`;
    const label = kind === 'heal' ? `💚 Curación de ${total} a ${targets}` : `🩸 ${total} de daño${type ? ` de ${type}` : ''} a ${targets}`;
    return chat.insert({
      campaignId,
      userId: user.id,
      userName: user.displayName,
      characterId: null,
      characterName: null,
      kind: 'roll',
      text: lines.join('\n'),
      roll: { label, expression: amount, total, rolls: roll.rolls },
      whisperTo: null,
      // Si hay tokens ocultos (capa del DM), el resumen solo lo ve el DM.
      secret: items.some((i) => i.layer === 'gm'),
    });
  }

  return { itemsOf, characterOf, hurt, heal, applyManual };
}
