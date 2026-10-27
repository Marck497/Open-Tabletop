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
    guardHandlers(socket, app);
    for (const mod of modules) mod.socket?.(socket, ctx);
  });

  app.addHook('onClose', async () => {
    await io.close();
  });
  return io;
}

/**
 * Un error en un manejador (p. ej. un mensaje mal formado) no puede tumbar el servidor: se anota,
 * se responde «Error interno» si el cliente esperaba respuesta y la mesa sigue funcionando.
 */
function guardHandlers(socket: Parameters<Parameters<IoServer['on']>[1]>[0], app: FastifyInstance) {
  const on = socket.on.bind(socket) as (event: string, listener: (...args: unknown[]) => unknown) => unknown;
  const guarded = (event: string, listener: (...args: unknown[]) => unknown) =>
    on(event, (...args: unknown[]) => {
      const last = args[args.length - 1];
      const ack = typeof last === 'function' ? (last as (r: unknown) => void) : null;
      const fail = (err: unknown) => {
        app.log.error({ err, event }, 'Error en un manejador de socket');
        try {
          ack?.({ ok: false, error: 'Error interno' });
        } catch {
          // el cliente ya no espera respuesta
        }
      };
      try {
        const result = listener(...args);
        if (result instanceof Promise) result.catch(fail);
      } catch (err) {
        fail(err);
      }
    });
  socket.on = guarded as unknown as typeof socket.on;
}
