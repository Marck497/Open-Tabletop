import { z } from 'zod';
import type { AppContext, ServerModule } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { handleAck } from '../../core/socket-utils.js';
import { createCampaignService } from '../campaigns/service.js';
import { broadcastInitiative } from '../initiative/index.js';
import { createInitiativeService } from '../initiative/service.js';
import { createAiService } from './service.js';

/** Pausa tras el turno de un enemigo antes de pasar al siguiente (para que se pueda seguir). */
export const AUTO_PAUSE_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Partidas en las que la IA está jugando ahora mismo (para no solaparse). */
const running = new Set<string>();

/**
 * Modo automático: mientras el turno sea de un enemigo con IA, juega y pasa turno.
 * Se para al llegar a un jugador (o tras una vuelta entera, por si solo hay enemigos).
 */
async function autoPlay(ctx: AppContext, campaignId: string, userId: string) {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  const ai = createAiService(ctx);
  const initiative = createInitiativeService(ctx);
  try {
    for (let played = 0; ; played++) {
      const state = initiative.load(campaignId);
      if (!state.active || !state.ai.auto || played >= state.entries.length) return;
      const itemId = ai.currentItemId(campaignId, state);
      const entryId = state.entries[state.turn]?.id;
      const result = itemId ? await ai.takeTurn(campaignId, itemId, { userId, applyDamage: state.ai.applyDamage }) : null;
      if (!result) return;
      await sleep(AUTO_PAUSE_MS);
      // Si alguien ha cambiado el turno mientras tanto, no se pasa otra vez.
      const now = initiative.load(campaignId);
      if (!now.active || now.entries[now.turn]?.id !== entryId) return;
      const advanced = initiative.advance(campaignId);
      await broadcastInitiative(ctx, advanced);
      ctx.events.emit('initiative:advanced', { campaignId, state: advanced });
    }
  } catch (e) {
    // No hay nadie a quien responder: se registra y se para.
    console.error('[ia] error en el turno automático', e);
  } finally {
    running.delete(campaignId);
  }
}

/** IA básica de enemigos. */
export const aiModule: ServerModule = {
  name: 'ai',

  init(ctx) {
    ctx.events.on('initiative:turnStarted', ({ campaignId, userId, state }) => {
      if (state.ai.auto) void autoPlay(ctx, campaignId, userId);
    });
  },

  socket(socket, ctx) {
    const ai = createAiService(ctx);
    const initiative = createInitiativeService(ctx);
    const campaigns = createCampaignService(ctx);

    /** El DM pide al token del turno actual (o a uno concreto) que actúe. */
    socket.on('ai:act', (payload, ack) =>
      handleAck(ack, async () => {
        const { campaignId, itemId } = z.object({ campaignId: z.string(), itemId: z.string().nullish() }).parse(payload);
        const userId = socket.data.user.id;
        campaigns.requireGm(campaignId, userId);
        if (running.has(campaignId)) throw badRequest('La IA ya está jugando un turno');
        const state = initiative.load(campaignId);
        const target = itemId ?? ai.currentItemId(campaignId, state);
        if (!target) throw badRequest('El turno actual no tiene token en la escena');
        running.add(campaignId);
        try {
          const result = await ai.takeTurn(campaignId, target, { userId, force: true, applyDamage: state.ai.applyDamage });
          if (!result) throw badRequest('Ese token no está en la escena activa');
          return result;
        } finally {
          running.delete(campaignId);
        }
      }),
    );
  },
};
