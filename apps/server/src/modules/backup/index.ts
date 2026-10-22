import { z } from 'zod';
import { MAX_BACKUP_BYTES } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { requireUser } from '../auth/index.js';
import { createBackupService } from './service.js';

/** Copias de seguridad de partidas desde la web (va después de "assets", que registra la subida de archivos). */
export const backupModule: ServerModule = {
  name: 'backup',

  routes(app, ctx) {
    const backup = createBackupService(ctx);

    app.get('/campaigns/:id/export', async (req, reply) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const { files } = z.object({ files: z.enum(['0', '1']).default('1') }).parse(req.query);
      const { filename, data } = backup.exportCampaign(id, requireUser(req).id, files === '1');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Cache-Control', 'no-store');
      return reply.type('application/gzip').send(data);
    });

    app.post('/campaigns/import', async (req, reply) => {
      const user = requireUser(req);
      const file = await req.file({ limits: { fileSize: MAX_BACKUP_BYTES, files: 1 } });
      if (!file) throw badRequest('Falta el archivo');
      const data = await file.toBuffer();
      return reply.code(201).send({ summary: backup.importCampaign(user.id, data) });
    });
  },
};
