import { z } from 'zod';
import type { ServerModule } from '../../core/module.js';
import { requireUser } from '../auth/index.js';
import { createPerformanceService } from './service.js';

/** Panel de rendimiento para la Pi (DM, pestaña Mesa): informe y limpieza de archivos sin usar. */
export const performanceModule: ServerModule = {
  name: 'performance',

  routes(app, ctx) {
    const perf = createPerformanceService(ctx);

    app.get('/campaigns/:id/performance', async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      return { report: perf.report(id, requireUser(req).id) };
    });

    app.post('/campaigns/:id/performance/cleanup', async (req) => {
      const { id } = z.object({ id: z.string() }).parse(req.params);
      const body = z.object({ assetIds: z.array(z.string().max(64)).max(5000).default([]), orphans: z.boolean().default(false) }).parse(req.body ?? {});
      return { result: perf.cleanup(id, requireUser(req).id, body) };
    });
  },
};
