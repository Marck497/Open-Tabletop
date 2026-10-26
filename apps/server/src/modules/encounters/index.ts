import { z } from 'zod';
import type { ServerModule } from '../../core/module.js';
import { requireUser } from '../auth/index.js';
import { createBoardBroadcaster } from '../board/broadcast.js';
import { createBoardService } from '../board/service.js';
import { broadcastCharacter } from '../sheets/index.js';
import { createEncounterService } from './service.js';

const campaignParams = z.object({ id: z.string() });
const encounterParams = z.object({ encounterId: z.string() });

/** Encuentros preparados: grupos de monstruos que el DM guarda y suelta en el tablero con un clic. */
export const encountersModule: ServerModule = {
  name: 'encounters',

  routes(app, ctx) {
    const svc = createEncounterService(ctx);
    const board = createBoardService(ctx);
    const broadcast = createBoardBroadcaster(ctx, board);

    app.get('/campaigns/:id/encounters', async (req) => {
      const { id } = campaignParams.parse(req.params);
      return { encounters: svc.list(id, requireUser(req).id) };
    });

    app.post('/campaigns/:id/encounters', async (req, reply) => {
      const { id } = campaignParams.parse(req.params);
      return reply.code(201).send({ encounter: svc.create(id, requireUser(req).id, req.body as never) });
    });

    app.patch('/encounters/:encounterId', async (req) => {
      const { encounterId } = encounterParams.parse(req.params);
      return { encounter: svc.update(encounterId, requireUser(req).id, req.body as never) };
    });

    app.delete('/encounters/:encounterId', async (req) => {
      const { encounterId } = encounterParams.parse(req.params);
      svc.remove(encounterId, requireUser(req).id);
      return { ok: true };
    });

    // Soltarlo en el tablero: hojas nuevas para el DM y tokens a quien pueda verlos.
    app.post('/encounters/:encounterId/deploy', async (req, reply) => {
      const { encounterId } = encounterParams.parse(req.params);
      const { scene, characters, items } = svc.deploy(encounterId, requireUser(req).id, req.body as never);
      for (const c of characters) await broadcastCharacter(ctx, null, c);
      for (const item of items) await broadcast.itemChanged(scene, null, item);
      return reply.code(201).send({ characters: characters.length, items: items.map((i) => i.id) });
    });
  },
};
