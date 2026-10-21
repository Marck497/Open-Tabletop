import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { LoginInput, PublicUser, RegisterInput } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, conflict, forbidden, unauthorized } from '../../core/errors.js';
import { sessions, users } from '../../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const toPublic = (u: { id: string; username: string; displayName: string }): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
});

export function createAuthService({ db, config }: AppContext) {
  async function register(input: RegisterInput): Promise<PublicUser> {
    if (config.registrationCode && input.registrationCode !== config.registrationCode) {
      throw forbidden('Código de registro incorrecto');
    }
    const username = input.username.toLowerCase();
    const existing = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
    if (existing) throw conflict('Ese nombre de usuario ya existe');

    const user = { id: randomUUID(), username, displayName: input.displayName, passwordHash: await hashPassword(input.password) };
    db.insert(users).values(user).run();
    return toPublic(user);
  }

  async function login(input: LoginInput): Promise<PublicUser> {
    const user = db.select().from(users).where(eq(users.username, input.username.toLowerCase())).get();
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw unauthorized('Usuario o contraseña incorrectos');
    }
    return toPublic(user);
  }

  /** Crea una sesión y devuelve el token en claro (solo va en la cookie). */
  function createSession(userId: string): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
    db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
    return { token, expiresAt };
  }

  function userFromSession(token: string | undefined): PublicUser | null {
    if (!token) return null;
    const row = db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .get();
    return row ?? null;
  }

  function destroySession(token: string | undefined): void {
    if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
  }

  function purgeExpiredSessions(): void {
    db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
  }

  function updateProfile(userId: string, displayName: string): PublicUser {
    const name = displayName.trim();
    if (!name || name.length > 48) throw badRequest('Nombre no válido');
    db.update(users).set({ displayName: name }).where(eq(users.id, userId)).run();
    const u = db.select().from(users).where(eq(users.id, userId)).get();
    if (!u) throw unauthorized();
    return toPublic(u);
  }

  return { register, login, createSession, userFromSession, destroySession, purgeExpiredSessions, updateProfile };
}

export type AuthService = ReturnType<typeof createAuthService>;
