import type { ServerModule } from '../../core/module.js';
import { handleAck } from '../../core/socket-utils.js';
import { broadcastMessage } from '../chat/index.js';
import { createDamageService } from './service.js';

/** Daño y curación a mano: el DM los aplica a los tokens elegidos y el resumen sale en el chat. */
export const damageModule: ServerModule = {
  name: 'damage',
  socket(socket, ctx) {
    const damage = createDamageService(ctx);
    socket.on('damage:apply', (payload, ack) =>
      handleAck(ack, async () => {
        const message = await damage.applyManual(socket.data.user, payload);
        await broadcastMessage(ctx, message);
        return message;
      }),
    );
  },
};
