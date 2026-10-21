import type { FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema, registerSchema, type PublicUser } from '@vtt/shared';
import { z } from 'zod';
import type { ServerModule } from '../../core/module.js';
import { unauthorized } from '../../core/errors.js';
import { createAuthService } from './service.js';

export const SESSION_COOKIE = 'vtt_sid';

declare module 'fastify' {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}

/** Devuelve el usuario autenticado o lanza 401. Úsalo en cualquier ruta protegida. */
export function requireUser(req: FastifyRequest): PublicUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export const authModule: ServerModule = {
  name: 'auth',
  async routes(app, ctx) {
    const auth = createAuthService(ctx);
    auth.purgeExpiredSessions();

    const setSessionCookie = (reply: FastifyReply, userId: string) => {
      const { token, expiresAt } = auth.createSession(userId);
      reply.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: ctx.config.cookieSecure,
        expires: expiresAt,
      });
    };

    const strictLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

    app.get('/auth/config', async () => ({ registrationCodeRequired: Boolean(ctx.config.registrationCode) }));

    app.post('/auth/register', strictLimit, async (req, reply) => {
      const user = await auth.register(registerSchema.parse(req.body));
      setSessionCookie(reply, user.id);
      return reply.code(201).send({ user });
    });

    app.post('/auth/login', strictLimit, async (req, reply) => {
      const user = await auth.login(loginSchema.parse(req.body));
      setSessionCookie(reply, user.id);
      return { user };
    });

    app.post('/auth/logout', async (req, reply) => {
      auth.destroySession(req.cookies[SESSION_COOKIE]);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { ok: true };
    });

    app.get('/auth/me', async (req) => ({ user: req.user }));

    app.patch('/auth/me', async (req) => {
      const user = requireUser(req);
      const { displayName } = z.object({ displayName: z.string() }).parse(req.body);
      return { user: auth.updateProfile(user.id, displayName) };
    });
  },
};
