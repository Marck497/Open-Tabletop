import { campaignRoom } from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { handleAck } from '../../core/socket-utils.js';
import { createCampaignService } from '../campaigns/service.js';
import { createDiceService } from './service.js';
import type { RollResult } from '@vtt/shared';

/** Envía la tirada a la partida (las secretas, solo al DM y a quien tira). */
export async function broadcastRoll(ctx: AppContext, result: RollResult) {
  if (!ctx.io) return;
  if (!result.secret) {
    ctx.io.to(campaignRoom(result.campaignId)).emit('roll:result', result);
    return;
  }
  const campaigns = createCampaignService(ctx);
  for (const s of await ctx.io.in(campaignRoom(result.campaignId)).fetchSockets()) {
    const uid = s.data.user.id;
    if (uid === result.userId || campaigns.getRole(result.campaignId, uid) === 'gm') s.emit('roll:result', result);
  }
}

export const diceModule: ServerModule = {
  name: 'dice',
  socket(socket, ctx) {
    const dice = createDiceService(ctx);
    socket.on('roll', (payload, ack) =>
      handleAck(ack, async () => {
        const result = dice.roll(socket.data.user, payload);
        await broadcastRoll(ctx, result);
        return result;
      }),
    );
  },
};
