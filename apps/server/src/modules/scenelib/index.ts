import { z } from 'zod';
import { campaignRoom, libraryNameSchema, MAX_SCENE_PACKAGE_BYTES } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { requireUser } from '../auth/index.js';
import { createSceneLibraryService } from './service.js';

const campaignParams = z.object({ id: z.string() });
const sceneParams = z.object({ sceneId: z.string() });
const entryParams = z.object({ entryId: z.string() });

/**
 * Reutilizar escenas: duplicarlas, guardarlas en la biblioteca del DM para usarlas en otras
 * partidas y exportarlas o importarlas como archivo (va después de "assets", que registra la subida de archivos).
 */
export const sceneLibraryModule: ServerModule = {
  name: 'scenelib',

  routes(app, ctx) {
    const lib = createSceneLibraryService(ctx);
    const listChanged = (campaignId: string) => ctx.io?.to(campaignRoom(campaignId)).emit('scenes:changed', { campaignId });

    app.post('/scenes/:sceneId/duplicate', async (req, reply) => {
      const { sceneId } = sceneParams.parse(req.params);
      const scene = lib.duplicate(sceneId, requireUser(req).id);
      listChanged(scene.campaignId);
      return reply.code(201).send({ scene });
    });

    app.get('/scenes/:sceneId/export', async (req, reply) => {
      const { sceneId } = sceneParams.parse(req.params);
      const { filename, data } = lib.exportScene(sceneId, requireUser(req).id);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Cache-Control', 'no-store');
      return reply.type('application/gzip').send(data);
    });

    app.post('/campaigns/:id/scenes/import', async (req, reply) => {
      const { id } = campaignParams.parse(req.params);
      const user = requireUser(req);
      lib.assertGm(id, user.id);
      const file = await req.file({ limits: { fileSize: MAX_SCENE_PACKAGE_BYTES, files: 1 } });
      if (!file) throw badRequest('Falta el archivo');
      const data = await file.toBuffer();
      const scene = lib.importScene(id, user.id, data, file.filename);
      listChanged(id);
      return reply.code(201).send({ scene });
    });

    // ---------- Biblioteca ----------

    app.get('/scene-library', async (req) => ({ entries: lib.listLibrary(requireUser(req).id) }));

    app.post('/scenes/:sceneId/library', async (req, reply) => {
      const { sceneId } = sceneParams.parse(req.params);
      const { name } = libraryNameSchema.parse(req.body ?? {});
      return reply.code(201).send({ entry: lib.saveToLibrary(sceneId, requireUser(req).id, name) });
    });

    app.patch('/scene-library/:entryId', async (req) => {
      const { entryId } = entryParams.parse(req.params);
      const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
      return { entry: lib.renameLibrary(entryId, requireUser(req).id, name) };
    });

    app.delete('/scene-library/:entryId', async (req) => {
      const { entryId } = entryParams.parse(req.params);
      lib.removeLibrary(entryId, requireUser(req).id);
      return { ok: true };
    });

    app.post('/campaigns/:id/scene-library/:entryId', async (req, reply) => {
      const { id, entryId } = z.object({ id: z.string(), entryId: z.string() }).parse(req.params);
      const scene = lib.useFromLibrary(entryId, id, requireUser(req).id);
      listChanged(id);
      return reply.code(201).send({ scene });
    });
  },
};
