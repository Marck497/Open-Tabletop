import { and, eq, inArray } from 'drizzle-orm';
import { tr, statusesOf, type BoardItem, type InitiativeState } from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { boardItems, campaignMembers, users } from '../../db/schema.js';
import { createBoardBroadcaster } from '../board/broadcast.js';
import { createBoardService } from '../board/service.js';
import { broadcastMessage } from '../chat/index.js';
import { createChatService } from '../chat/service.js';
import { createSheetService } from '../sheets/service.js';

/**
 * Duración de los estados en rondas: al empezar el turno de un token en la iniciativa, a cada
 * estado suyo con duración le queda una ronda menos; al llegar a 0 se quita solo y se avisa en el chat.
 */
export function createDurationsService(ctx: AppContext) {
  const { db } = ctx;
  const board = createBoardService(ctx);
  const broadcaster = createBoardBroadcaster(ctx, board);
  const sheets = createSheetService(ctx);
  const chat = createChatService(ctx);

  /** Tokens del turno: el de la entrada o, si no tiene, los de su personaje. */
  function tokensOfTurn(state: InitiativeState): BoardItem[] {
    const entry = state.entries[state.turn];
    const scenes = board.sceneIdsOf(state.campaignId);
    if (!entry || !scenes.length) return [];
    const where = entry.itemId ? eq(boardItems.id, entry.itemId) : entry.characterId ? eq(boardItems.characterId, entry.characterId) : null;
    if (!where) return [];
    const rows = db.select({ id: boardItems.id, sceneId: boardItems.sceneId }).from(boardItems).where(and(where, inArray(boardItems.sceneId, scenes))).all();
    return rows.flatMap((r) => board.itemsOf(r.sceneId).items.filter((i) => i.id === r.id));
  }

  async function onTurn(state: InitiativeState) {
    const tokens = tokensOfTurn(state).filter((t) => Object.keys(t.statusRounds).length);
    if (!tokens.length) return;
    const defs = statusesOf(sheets.getTemplate(state.campaignId));
    const ended: { name: string; labels: string[]; hidden: boolean }[] = [];
    for (const t of tokens) {
      const rounds: Record<string, number> = {};
      const gone: string[] = [];
      for (const [id, left] of Object.entries(t.statusRounds)) {
        if (!t.statuses.includes(id)) continue;
        if (left <= 1) gone.push(id);
        else rounds[id] = left - 1;
      }
      const { scene, before, after } = board.systemUpdate(t.sceneId, t.id, { statuses: t.statuses.filter((s) => !gone.includes(s)), statusRounds: rounds });
      await broadcaster.itemChanged(scene, before, after);
      if (gone.length) {
        const character = t.characterId ? sheets.row(t.characterId) : null;
        ended.push({
          name: t.name || character?.name || tr('Token'),
          labels: gone.map((id) => defs.find((d) => d.id === id)?.label.toLowerCase() ?? id),
          hidden: t.layer === 'gm' || state.entries[state.turn]?.hidden === true,
        });
      }
    }
    if (!ended.length) return;
    const gm = db
      .select({ id: users.id, name: users.displayName })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(and(eq(campaignMembers.campaignId, state.campaignId), eq(campaignMembers.role, 'gm')))
      .get();
    if (!gm) return;
    for (const e of ended) {
      const message = chat.insert({
        campaignId: state.campaignId,
        userId: gm.id,
        userName: gm.name,
        characterId: null,
        characterName: null,
        kind: 'system',
        text: tr('⏳ {name}: se acaba {1}', { name: e.name, '1': e.labels.map((l) => tr(l)).join(', ') }),
        roll: null,
        whisperTo: null,
        secret: e.hidden,
      });
      await broadcastMessage(ctx, message);
    }
  }

  return { onTurn };
}

export const durationsModule: ServerModule = {
  name: 'durations',
  init(ctx) {
    const service = createDurationsService(ctx);
    ctx.events.on('initiative:advanced', ({ state }) => {
      service.onTurn(state).catch((err: unknown) => console.error('Duración de estados:', err));
    });
  },
};
