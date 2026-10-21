import { z } from 'zod';
import { campaignRoom } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { handleAck } from '../../core/socket-utils.js';
import { createJukeboxService } from './service.js';

/** Música y ambiente sincronizados para toda la mesa. */
export const jukeboxModule: ServerModule = {
  name: 'jukebox',

  socket(socket, ctx) {
    const svc = createJukeboxService(ctx);

    socket.on('jukebox:get', (payload, ack) =>
      handleAck(ack, () => {
        const { campaignId } = z.object({ campaignId: z.string() }).parse(payload);
        return { state: svc.get(campaignId, socket.data.user.id), serverNow: Date.now() };
      }),
    );

    socket.on('jukebox:action', (payload, ack) =>
      handleAck(ack, () => {
        const { campaignId, ...action } = payload;
        const state = svc.apply(z.string().parse(campaignId), socket.data.user.id, action as never);
        ctx.io?.to(campaignRoom(state.campaignId)).emit('jukebox:updated', { state, serverNow: Date.now() });
        return undefined;
      }),
    );
  },
};
