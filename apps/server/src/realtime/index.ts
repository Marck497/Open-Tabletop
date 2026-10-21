import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import type { AppContext, IoServer } from '../core/module.js';
import { modules } from '../modules/index.js';
import { SESSION_COOKIE } from '../modules/auth/index.js';
import { createAuthService } from '../modules/auth/service.js';

/** Arranca Socket.IO sobre el mismo servidor HTTP y conecta los manejadores de cada módulo. */
export function attachRealtime(app: FastifyInstance, ctx: AppContext): IoServer {
  const io: IoServer = new Server(app.server, { serveClient: false });
  const auth = createAuthService(ctx);
  ctx.io = io;

  // Solo se aceptan sockets de usuarios con sesión iniciada (misma cookie que la API).
  io.use((socket, next) => {
    const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '');
    const user = auth.userFromSession(cookies[SESSION_COOKIE]);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    for (const mod of modules) mod.socket?.(socket, ctx);
  });

  app.addHook('onClose', async () => {
    await io.close();
  });
  return io;
}
