import { z } from 'zod';
import { campaignRoom, type Character } from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { requireUser } from '../auth/index.js';
import { createCampaignService } from '../campaigns/service.js';
import { canSeeCharacter, createSheetService } from './service.js';

const campaignParams = z.object({ id: z.string() });
const characterParams = z.object({ characterId: z.string() });

/** Envía un cambio de personaje a cada socket de la partida según si puede verlo. */
async function broadcastCharacter(ctx: AppContext, before: Character | null, after: Character | null) {
  const c = (after ?? before)!;
  if (!ctx.io) return;
  const campaigns = createCampaignService(ctx);
  for (const s of await ctx.io.in(campaignRoom(c.campaignId)).fetchSockets()) {
    const userId = s.data.user.id;
    const role = campaigns.getRole(c.campaignId, userId);
    if (!role) continue;
    if (after && canSeeCharacter(after, role, userId)) s.emit('character:upserted', { character: after });
    else if (before && canSeeCharacter(before, role, userId)) s.emit('character:removed', { campaignId: c.campaignId, id: c.id });
  }
}

/** Hojas de personaje: plantilla editable por partida y personajes. */
export const sheetsModule: ServerModule = {
  name: 'sheets',

  init(ctx) {
    const sheets = createSheetService(ctx);
    // La plantilla se copia a la partida al crearla (desde ahí el DM la edita).
    ctx.events.on('campaign:created', ({ campaignId }) => void sheets.getTemplate(campaignId));
  },

  routes(app, ctx) {
    const sheets = createSheetService(ctx);

    app.get('/campaigns/:id/sheet-template', async (req) => {
      const { id } = campaignParams.parse(req.params);
      return { template: sheets.templateFor(id, requireUser(req).id) };
    });

    app.put('/campaigns/:id/sheet-template', async (req) => {
      const { id } = campaignParams.parse(req.params);
      const { template } = z.object({ template: z.unknown() }).parse(req.body);
      const saved = sheets.saveTemplate(id, requireUser(req).id, template);
      ctx.io?.to(campaignRoom(id)).emit('template:updated', { campaignId: id });
      return { template: saved };
    });

    app.post('/campaigns/:id/sheet-template/reset', async (req) => {
      const { id } = campaignParams.parse(req.params);
      const { builtinId } = z.object({ builtinId: z.string() }).parse(req.body);
      const saved = sheets.resetTemplate(id, requireUser(req).id, builtinId);
      ctx.io?.to(campaignRoom(id)).emit('template:updated', { campaignId: id });
      return { template: saved };
    });

    app.get('/campaigns/:id/characters', async (req) => {
      const { id } = campaignParams.parse(req.params);
      return { characters: sheets.list(id, requireUser(req).id) };
    });

    app.post('/campaigns/:id/characters', async (req, reply) => {
      const { id } = campaignParams.parse(req.params);
      const character = sheets.create(id, requireUser(req).id, req.body as never);
      await broadcastCharacter(ctx, null, character);
      return reply.code(201).send({ character });
    });

    app.get('/characters/:characterId', async (req) => {
      const { characterId } = characterParams.parse(req.params);
      return { character: sheets.access(characterId, requireUser(req).id).character };
    });

    app.patch('/characters/:characterId', async (req) => {
      const { characterId } = characterParams.parse(req.params);
      const { before, after } = sheets.update(characterId, requireUser(req).id, req.body as never);
      await broadcastCharacter(ctx, before, after);
      return { character: after };
    });

    app.delete('/characters/:characterId', async (req) => {
      const { characterId } = characterParams.parse(req.params);
      const removed = sheets.remove(characterId, requireUser(req).id);
      await broadcastCharacter(ctx, removed, null);
      return { ok: true };
    });
  },
};
