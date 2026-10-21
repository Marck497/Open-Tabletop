import { afterEach, describe, expect, it } from 'vitest';
import { makeApp, registerUser } from './helpers.js';

let app: Awaited<ReturnType<typeof makeApp>>['app'];
afterEach(() => app?.close());

describe('auth', () => {
  it('registra, devuelve el usuario en /me y permite cerrar sesión', async () => {
    ({ app } = await makeApp());
    const { cookie } = await registerUser(app, 'marcos');

    const me = await app.inject({ url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user).toMatchObject({ username: 'marcos', displayName: 'MARCOS' });

    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const after = await app.inject({ url: '/api/auth/me', headers: { cookie } });
    expect(after.json().user).toBeNull();
  });

  it('rechaza usuarios duplicados y contraseñas incorrectas', async () => {
    ({ app } = await makeApp());
    await registerUser(app, 'marcos');
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'MARCOS', displayName: 'x', password: '12345678' },
    });
    expect(dup.statusCode).toBe(409);

    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'marcos', password: 'mal' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'Marcos', password: 'contraseña-segura' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('exige el código de registro si está configurado', async () => {
    ({ app } = await makeApp({ registrationCode: 'dragon' }));
    const payload = { username: 'ana', displayName: 'Ana', password: '12345678' };
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload })).statusCode).toBe(403);
    const ok = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ...payload, registrationCode: 'dragon' } });
    expect(ok.statusCode).toBe(201);
  });

  it('las rutas protegidas devuelven 401 sin sesión', async () => {
    ({ app } = await makeApp());
    expect((await app.inject({ url: '/api/campaigns' })).statusCode).toBe(401);
  });
});
