import { z } from 'zod';
import { campaignRoom } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { handleAck } from '../../core/socket-utils.js';
import { requireUser } from '../auth/index.js';
import { broadcastMessage } from '../chat/index.js';
import { createHomebrewEffects } from './effects.js';
import { createHomebrewService } from './service.js';

const campaignParams = z.object({ id: z.string() });
const entryParams = z.object({ entryId: z.string() });

/**
 * Creaciones: hechizos, ataques y objetos editables. Se usan desde las hojas (filas enlazadas)
 * con los botones de acción; el DM aplica su efecto a los tokens desde el chat.
 */
export const homebrewModule: ServerModule = {
  name: 'homebrew',

  routes(app, ctx) {
    const svc = createHomebrewService(ctx);
    const changed = (campaignId: string) => ctx.io?.to(campaignRoom(campaignId)).emit('homebrew:changed', { campaignId });

    app.get('/campaigns/:id/homebrew', async (req) => {
      const { id } = campaignParams.parse(req.params);
      return { entries: svc.list(id, requireUser(req).id) };
    });

    app.post('/campaigns/:id/homebrew', async (req, reply) => {
      const { id } = campaignParams.parse(req.params);
      const entry = svc.create(id, requireUser(req).id, req.body as never);
      changed(id);
      return reply.code(201).send({ entry });
    });

    app.get('/homebrew/:entryId', async (req) => {
      const { entryId } = entryParams.parse(req.params);
      return { entry: svc.access(entryId, requireUser(req).id).entry };
    });

    app.patch('/homebrew/:entryId', async (req) => {
      const { entryId } = entryParams.parse(req.params);
      const entry = svc.update(entryId, requireUser(req).id, req.body as never);
      changed(entry.campaignId);
      return { entry };
    });

    app.delete('/homebrew/:entryId', async (req) => {
      const { entryId } = entryParams.parse(req.params);
      const entry = svc.remove(entryId, requireUser(req).id);
      changed(entry.campaignId);
      return { ok: true };
    });
  },

  socket(socket, ctx) {
    const effects = createHomebrewEffects(ctx);
    socket.on('effect:apply', (payload, ack) =>
      handleAck(ack, async () => {
        const p = z.object({ messageId: z.string().min(1).max(64), itemIds: z.array(z.string().min(1).max(64)).max(100) }).parse(payload);
        const message = await effects.apply(socket.data.user, p.messageId, p.itemIds);
        await broadcastMessage(ctx, message);
        return message;
      }),
    );
  },
};
