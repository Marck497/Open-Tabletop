import { z } from 'zod';
import { campaignRoom, type ChatMessage } from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { handleAck } from '../../core/socket-utils.js';
import { requireUser } from '../auth/index.js';
import { createCampaignService } from '../campaigns/service.js';
import { broadcastCharacter } from '../sheets/index.js';
import { createHomebrewEffects } from '../homebrew/effects.js';
import { createSheetActions } from './actions.js';
import { canSeeMessage, createChatService } from './service.js';

/** Envía un mensaje a quienes pueden verlo. */
export async function broadcastMessage(ctx: AppContext, m: ChatMessage) {
  if (!ctx.io) return;
  if (!m.secret && !m.whisperTo) {
    ctx.io.to(campaignRoom(m.campaignId)).emit('chat:message', m);
    return;
  }
  const campaigns = createCampaignService(ctx);
  for (const s of await ctx.io.in(campaignRoom(m.campaignId)).fetchSockets()) {
    const role = campaigns.getRole(m.campaignId, s.data.user.id);
    if (role && canSeeMessage(m, role, s.data.user.id)) s.emit('chat:message', m);
  }
}

/** Chat y tiradas de la partida. */
export const chatModule: ServerModule = {
  name: 'chat',

  routes(app, ctx) {
    const chat = createChatService(ctx);

    app.get('/campaigns/:id/chat', async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const { before } = z.object({ before: z.string().optional() }).parse(req.query);
      return { messages: chat.history(id, requireUser(req).id, before) };
    });

    app.delete('/campaigns/:id/chat', async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      chat.clear(id, requireUser(req).id);
      ctx.io?.to(campaignRoom(id)).emit('chat:cleared', { campaignId: id });
      return { ok: true };
    });
  },

  socket(socket, ctx) {
    const chat = createChatService(ctx);
    const actions = createSheetActions(ctx);
    const effects = createHomebrewEffects(ctx);

    socket.on('chat:send', (payload, ack) =>
      handleAck(ack, async () => {
        const p = z.object({ campaignId: z.string(), text: z.string(), asCharacterId: z.string().nullish() }).parse(payload);
        const msg = chat.send(socket.data.user, p.campaignId, p.text, p.asCharacterId);
        await broadcastMessage(ctx, msg);
        return msg;
      }),
    );

    socket.on('sheet:action', (payload, ack) =>
      handleAck(ack, async () => {
        const { message, before, after, selfStatus } = actions.run(socket.data.user, payload);
        if (after) await broadcastCharacter(ctx, before, after);
        await broadcastMessage(ctx, message);
        if (selfStatus) await effects.markCaster(before.campaignId, before.id, selfStatus);
        return message;
      }),
    );

    socket.on('roll', (payload, ack) =>
      handleAck(ack, async () => {
        const msg = chat.roll(socket.data.user, payload);
        await broadcastMessage(ctx, msg);
        return msg;
      }),
    );
  },
};
