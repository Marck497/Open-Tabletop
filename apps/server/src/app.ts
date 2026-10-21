import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import { AppError } from './core/errors.js';
import type { AppContext } from './core/module.js';
import { openDatabase } from './db/client.js';
import { modules } from './modules/index.js';
import { SESSION_COOKIE } from './modules/auth/index.js';
import { createAuthService } from './modules/auth/service.js';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

export async function buildApp(config: AppConfig, opts: { logger?: boolean } = {}): Promise<BuiltApp> {
  const { db, close } = openDatabase(config.databasePath);
  const ctx: AppContext = { config, db, io: null };
  const auth = createAuthService(ctx);

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  app.addHook('onClose', async () => close());

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    req.user = auth.userFromSession(req.cookies[SESSION_COOKIE]);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.code(err.statusCode).send({ error: err.message });
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues[0]?.message ?? 'Datos no válidos', issues: err.issues });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Error interno del servidor' });
  });

  await app.register(
    async (api) => {
      for (const mod of modules) if (mod.routes) await mod.routes(api, ctx);
      api.get('/health', async () => ({ ok: true }));
      api.all('/*', async (_req, reply) => reply.code(404).send({ error: 'Ruta no encontrada' }));
    },
    { prefix: '/api' },
  );

  // En producción el servidor también sirve la web compilada (una sola app, un solo puerto).
  if (config.webDistDir && fs.existsSync(path.join(config.webDistDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/socket.io')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'No encontrado' });
    });
  }

  return { app, ctx };
}
