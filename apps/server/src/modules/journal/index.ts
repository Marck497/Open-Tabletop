import { z } from 'zod';
import { campaignRoom, type Handout } from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { requireUser } from '../auth/index.js';
import { createCampaignService } from '../campaigns/service.js';
import { canSeeHandout, createJournalService, handoutFor } from './service.js';

const campaignParams = z.object({ id: z.string() });
const handoutParams = z.object({ handoutId: z.string() });

/** Envía un cambio a cada socket de la partida según lo que puede ver (aparece, cambia o desaparece). */
async function broadcastHandout(ctx: AppContext, before: Handout | null, after: Handout | null) {
  const h = (after ?? before)!;
  if (!ctx.io) return;
  const campaigns = createCampaignService(ctx);
  for (const s of await ctx.io.in(campaignRoom(h.campaignId)).fetchSockets()) {
    const userId = s.data.user.id;
    const role = campaigns.getRole(h.campaignId, userId);
    if (!role) continue;
    if (after && canSeeHandout(after, role, userId)) s.emit('handout:upserted', { handout: handoutFor(after, role) });
    else if (before && canSeeHandout(before, role, userId)) s.emit('handout:removed', { campaignId: h.campaignId, id: h.id });
  }
}

/** Diario: documentos y notas que el DM comparte con los jugadores. */
export const journalModule: ServerModule = {
  name: 'journal',

  routes(app, ctx) {
    const journal = createJournalService(ctx);
    const campaigns = createCampaignService(ctx);

    app.get('/campaigns/:id/handouts', async (req) => {
      const { id } = campaignParams.parse(req.params);
      return { handouts: journal.list(id, requireUser(req).id) };
    });

    app.post('/campaigns/:id/handouts', async (req, reply) => {
      const { id } = campaignParams.parse(req.params);
      const handout = journal.create(id, requireUser(req).id, req.body as never);
      await broadcastHandout(ctx, null, handout);
      return reply.code(201).send({ handout });
    });

    app.get('/handouts/:handoutId', async (req) => {
      const { handoutId } = handoutParams.parse(req.params);
      const { handout, role } = journal.access(handoutId, requireUser(req).id);
      return { handout: handoutFor(handout, role) };
    });

    app.patch('/handouts/:handoutId', async (req) => {
      const { handoutId } = handoutParams.parse(req.params);
      const { before, after } = journal.update(handoutId, requireUser(req).id, req.body as never);
      await broadcastHandout(ctx, before, after);
      return { handout: after };
    });

    app.delete('/handouts/:handoutId', async (req) => {
      const { handoutId } = handoutParams.parse(req.params);
      const h = journal.remove(handoutId, requireUser(req).id);
      await broadcastHandout(ctx, h, null);
      return { ok: true };
    });

    /** Enseñar a la mesa: se abre en la pantalla de todos los que pueden verlo. */
    app.post('/handouts/:handoutId/show', async (req) => {
      const { handoutId } = handoutParams.parse(req.params);
      const userId = requireUser(req).id;
      const h = journal.row(handoutId);
      campaigns.requireGm(h.campaignId, userId);
      if (!h.visibleToAll && !h.sharedWith.length) throw badRequest('Compártelo antes con algún jugador');
      for (const s of (await ctx.io?.in(campaignRoom(h.campaignId)).fetchSockets()) ?? []) {
        const role = campaigns.getRole(h.campaignId, s.data.user.id);
        if (role && canSeeHandout(h, role, s.data.user.id)) s.emit('handout:show', { campaignId: h.campaignId, id: h.id });
      }
      return { ok: true };
    });
  },
};
