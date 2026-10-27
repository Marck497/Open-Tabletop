import { and, eq, inArray } from 'drizzle-orm';
import { tr, allFields, concentrationDc, createResolver, evaluate, saveOptions, statusesOf, type BoardItem, type ChatRollPart } from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { boardItems, campaignMembers, users } from '../../db/schema.js';
import { createBoardBroadcaster } from '../board/broadcast.js';
import { createBoardService } from '../board/service.js';
import { broadcastMessage } from '../chat/index.js';
import { createChatService } from '../chat/service.js';
import { secureRng } from '../dice/service.js';
import { createSheetService } from '../sheets/service.js';

/**
 * Concentración: cuando una hoja pierde vida y alguno de sus tokens tiene el estado de
 * concentración, el servidor tira la salvación (CD 10 o la mitad del daño) y, si falla o cae
 * a 0 PG, le quita el estado. El resultado sale en el chat.
 */
export function createConcentrationService(ctx: AppContext) {
  const { db } = ctx;
  const board = createBoardService(ctx);
  const broadcaster = createBoardBroadcaster(ctx, board);
  const sheets = createSheetService(ctx);
  const chat = createChatService(ctx);

  /** Tokens de la hoja en las escenas de la partida. */
  function tokensOf(campaignId: string, characterId: string): BoardItem[] {
    const scenes = board.sceneIdsOf(campaignId);
    if (!scenes.length) return [];
    const rows = db
      .select({ id: boardItems.id, sceneId: boardItems.sceneId })
      .from(boardItems)
      .where(and(eq(boardItems.characterId, characterId), inArray(boardItems.sceneId, scenes)))
      .all();
    return rows.flatMap((r) => board.itemsOf(r.sceneId).items.filter((i) => i.id === r.id));
  }

  /** Quien firma el mensaje: el primer DM de la partida. */
  function gmOf(campaignId: string) {
    return db
      .select({ id: users.id, name: users.displayName })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, 'gm')))
      .get();
  }

  async function onDamage({ campaignId, characterId, damage, hp }: { campaignId: string; characterId: string; damage: number; hp: number }) {
    const template = sheets.getTemplate(campaignId);
    const status = statusesOf(template).find((s) => s.concentration);
    if (!status) return;
    const tokens = tokensOf(campaignId, characterId).filter((t) => t.statuses.includes(status.id));
    if (!tokens.length) return;
    const character = sheets.row(characterId);
    const gm = gmOf(campaignId);
    if (!gm) return;

    const dc = concentrationDc(damage);
    let lost = hp <= 0;
    let part: ChatRollPart | null = null;
    if (!lost) {
      const opt = saveOptions(template).find((o) => o.value === status.concentration);
      const field = opt ? allFields(template).find((f) => f.key === opt.key) : undefined;
      const resolve = createResolver(template, character.values);
      let expression = field ? field.roll || `1d20 + @{${field.key}}` : '1d20';
      let r;
      try {
        r = evaluate(expression, { resolve, rng: secureRng });
      } catch {
        expression = '1d20';
        r = evaluate(expression, { rng: secureRng });
      }
      const total = Math.round(r.value);
      lost = total < dc;
      part = { label: tr('Salvación de {0} (CD {dc}) {2}', { '0': tr(opt?.label ?? status.concentration ?? ''), dc, '2': lost ? tr('✘ falla') : tr('✔ salva') }), expression, total, rolls: r.rolls };
    }

    if (lost) {
      for (const t of tokens) {
        const { scene, before, after } = board.systemUpdate(t.sceneId, t.id, { statuses: t.statuses.filter((s) => s !== status.id) });
        await broadcaster.itemChanged(scene, before, after);
      }
    }
    const verdict = lost ? (hp <= 0 ? tr('cae a 0 PG y pierde la concentración') : tr('pierde la concentración')) : tr('mantiene la concentración');
    const message = chat.insert({
      campaignId,
      userId: gm.id,
      userName: gm.name,
      characterId: character.id,
      characterName: character.name,
      kind: 'roll',
      text: '',
      roll: part ? { ...part, label: `${status.icon} ${character.name} ${verdict}: ${part.label.toLowerCase()}` } : { label: `${status.icon} ${character.name} ${verdict}`, expression: '', total: 0, rolls: [] },
      whisperTo: null,
      // Si sus tokens están ocultos (capa del DM), solo lo ve el DM.
      secret: tokens.every((t) => t.layer === 'gm'),
    });
    await broadcastMessage(ctx, message);
  }

  return { onDamage };
}

export const concentrationModule: ServerModule = {
  name: 'concentration',
  init(ctx) {
    const service = createConcentrationService(ctx);
    ctx.events.on('character:damaged', (e) => {
      service.onDamage(e).catch((err: unknown) => console.error('Concentración:', err));
    });
  },
};
