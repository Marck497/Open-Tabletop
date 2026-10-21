import { campaignRoom, type InitiativeState } from '@vtt/shared';
import { z } from 'zod';
import type { AppContext, ServerModule } from '../../core/module.js';
import { handleAck } from '../../core/socket-utils.js';
import { createCampaignService } from '../campaigns/service.js';
import { createInitiativeService, viewFor } from './service.js';

export async function broadcastInitiative(ctx: AppContext, state: InitiativeState) {
  if (!ctx.io) return;
  const campaigns = createCampaignService(ctx);
  for (const s of await ctx.io.in(campaignRoom(state.campaignId)).fetchSockets()) {
    const role = campaigns.getRole(state.campaignId, s.data.user.id);
    if (role) s.emit('initiative:updated', viewFor(state, role));
  }
}

/** Orden de iniciativa (turnos de combate). */
export const initiativeModule: ServerModule = {
  name: 'initiative',

  init(ctx) {
    const svc = createInitiativeService(ctx);
    ctx.events.on('initiative:rolled', (p) => void broadcastInitiative(ctx, svc.fromRoll(p)));
  },

  socket(socket, ctx) {
    const svc = createInitiativeService(ctx);

    socket.on('initiative:get', (payload, ack) =>
      handleAck(ack, () => {
        const { campaignId } = z.object({ campaignId: z.string() }).parse(payload);
        const { state, role } = svc.get(campaignId, socket.data.user.id);
        return viewFor(state, role);
      }),
    );

    socket.on('initiative:action', (payload, ack) =>
      handleAck(ack, async () => {
        const { campaignId, ...action } = payload;
        const state = svc.apply(z.string().parse(campaignId), socket.data.user.id, action as never);
        await broadcastInitiative(ctx, state);
        if (['next', 'prev', 'start'].includes(action.type) && state.active) {
          ctx.events.emit('initiative:turnStarted', { campaignId, userId: socket.data.user.id, state });
        }
        const role = createCampaignService(ctx).getRole(campaignId, socket.data.user.id)!;
        return viewFor(state, role);
      }),
    );
  },
};
