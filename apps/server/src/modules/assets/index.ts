import fs from 'node:fs';
import path from 'node:path';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import type { ServerModule } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { requireUser } from '../auth/index.js';
import { createAssetService, MAX_ASSET_BYTES } from './service.js';

export const assetsModule: ServerModule = {
  name: 'assets',
  init(ctx) {
    // Al borrar una partida se borran también sus archivos.
    ctx.events.on('campaign:deleted', ({ campaignId }) => {
      fs.rmSync(path.join(ctx.config.dataDir, 'uploads', campaignId), { recursive: true, force: true });
    });
  },
  async routes(app, ctx) {
    const assets = createAssetService(ctx);
    await app.register(multipart, { limits: { fileSize: MAX_ASSET_BYTES, files: 1 } });

    app.post('/campaigns/:id/assets', async (req, reply) => {
      const user = requireUser(req);
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const file = await req.file();
      if (!file) throw badRequest('Falta el archivo');
      const data = await file.toBuffer();
      return reply.code(201).send({ asset: assets.save(id, user.id, { filename: file.filename, mimetype: file.mimetype, data }) });
    });

    app.get('/campaigns/:id/assets', async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      return { assets: assets.list(id, requireUser(req).id) };
    });

    app.get('/assets/:assetId', async (req, reply) => {
      const { assetId } = z.object({ assetId: z.string() }).parse(req.params);
      const { absPath, mime, size } = assets.fileFor(assetId, requireUser(req).id);
      // Los assets no cambian nunca (id nuevo en cada subida): caché larga en el navegador.
      reply.header('Cache-Control', 'private, max-age=31536000, immutable');
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      reply.header('Accept-Ranges', 'bytes');
      // Peticiones por rangos: el audio las necesita para saltar al punto en que va la canción.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        let start = range[1] ? Number(range[1]) : size - Number(range[2]);
        let end = range[1] && range[2] ? Number(range[2]) : size - 1;
        start = Math.max(0, start);
        end = Math.min(end, size - 1);
        if (start > end) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
        reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`).header('Content-Length', end - start + 1);
        return reply.type(mime).send(fs.createReadStream(absPath, { start, end }));
      }
      reply.header('Content-Length', size);
      return reply.type(mime).send(fs.createReadStream(absPath));
    });

    app.delete('/assets/:assetId', async (req) => {
      const { assetId } = z.object({ assetId: z.string() }).parse(req.params);
      assets.remove(assetId, requireUser(req).id);
      return { ok: true };
    });
  },
};
