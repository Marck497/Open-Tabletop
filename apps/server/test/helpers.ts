import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { attachRealtime } from '../src/realtime/index.js';

export async function makeApp(overrides: Partial<AppConfig> = {}) {
  const config = { ...loadConfig({}), databasePath: ':memory:', webDistDir: null, ...overrides };
  const built = await buildApp(config);
  return built;
}

/** Registra un usuario y devuelve la cookie de sesión. */
export async function registerUser(app: Awaited<ReturnType<typeof makeApp>>['app'], username: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, displayName: username.toUpperCase(), password: 'contraseña-segura' },
  });
  if (res.statusCode !== 201) throw new Error(`register falló: ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'vtt_sid');
  return { cookie: `vtt_sid=${cookie!.value}`, user: res.json().user as { id: string } };
}

/** Arranca la app escuchando en un puerto real con Socket.IO (para tests en tiempo real). */
export async function listenWithRealtime() {
  const built = await makeApp();
  attachRealtime(built.app, built.ctx);
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = built.app.server.address() as AddressInfo;
  return { ...built, url: `http://127.0.0.1:${port}` };
}
