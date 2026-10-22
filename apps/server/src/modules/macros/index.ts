import { z } from 'zod';
import { campaignRoom } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { requireUser } from '../auth/index.js';
import { createMacroService } from './service.js';

const campaignParams = z.object({ id: z.string() });
const macroParams = z.object({ macroId: z.string() });

/** Macros (botones de tiradas y comandos). Se ejecutan en el cliente enviando sus líneas al chat. */
export const macrosModule: ServerModule = {
  name: 'macros',

  routes(app, ctx) {
    const svc = createMacroService(ctx);
    const changed = (campaignId: string) => ctx.io?.to(campaignRoom(campaignId)).emit('macros:changed', { campaignId });

    app.get('/campaigns/:id/macros', async (req) => {
      const { id } = campaignParams.parse(req.params);
      return { macros: svc.list(id, requireUser(req).id) };
    });

    app.post('/campaigns/:id/macros', async (req, reply) => {
      const { id } = campaignParams.parse(req.params);
      const macro = svc.create(id, requireUser(req).id, req.body as never);
      changed(id);
      return reply.code(201).send({ macro });
    });

    app.patch('/macros/:macroId', async (req) => {
      const { macroId } = macroParams.parse(req.params);
      const macro = svc.update(macroId, requireUser(req).id, req.body as never);
      changed(macro.campaignId);
      return { macro };
    });

    app.delete('/macros/:macroId', async (req) => {
      const { macroId } = macroParams.parse(req.params);
      const macro = svc.remove(macroId, requireUser(req).id);
      changed(macro.campaignId);
      return { ok: true };
    });
  },
};
