import { z } from 'zod';
import { CAMPAIGN_ROLES, joinCampaignSchema } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { requireUser } from '../auth/index.js';
import { createCampaignService } from './service.js';

const idParams = z.object({ id: z.string() });
const memberParams = z.object({ id: z.string(), userId: z.string() });

export const campaignsModule: ServerModule = {
  name: 'campaigns',
  routes(app, ctx) {
    const campaigns = createCampaignService(ctx);

    app.get('/campaigns', async (req) => ({ campaigns: campaigns.listForUser(requireUser(req).id) }));

    app.post('/campaigns', async (req, reply) => {
      const campaign = campaigns.create(requireUser(req).id, req.body as never);
      return reply.code(201).send({ campaign });
    });

    app.post('/campaigns/join', async (req) => {
      const { inviteCode } = joinCampaignSchema.parse(req.body);
      return { campaign: campaigns.joinByInvite(requireUser(req).id, inviteCode) };
    });

    app.get('/campaigns/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      return { campaign: campaigns.get(id, requireUser(req).id) };
    });

    app.patch('/campaigns/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      return { campaign: campaigns.update(id, requireUser(req).id, req.body as never) };
    });

    app.delete('/campaigns/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      campaigns.remove(id, requireUser(req).id);
      return { ok: true };
    });

    app.post('/campaigns/:id/invite', async (req) => {
      const { id } = idParams.parse(req.params);
      return { inviteCode: campaigns.regenerateInvite(id, requireUser(req).id) };
    });

    app.patch('/campaigns/:id/members/:userId', async (req) => {
      const { id, userId } = memberParams.parse(req.params);
      const { role } = z.object({ role: z.enum(CAMPAIGN_ROLES) }).parse(req.body);
      campaigns.setMemberRole(id, requireUser(req).id, userId, role);
      return { ok: true };
    });

    app.delete('/campaigns/:id/members/:userId', async (req) => {
      const { id, userId } = memberParams.parse(req.params);
      campaigns.removeMember(id, requireUser(req).id, userId);
      return { ok: true };
    });
  },
};
