import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, PresenceUser, ServerToClientEvents } from '@vtt/shared';
import { listenWithRealtime, registerUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: Awaited<ReturnType<typeof listenWithRealtime>>;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.app.close();
});

function client(cookie?: string): Client {
  const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, reconnection: false });
  clients.push(c);
  return c;
}

const once = <T>(fn: (resolve: (v: T) => void) => void) => new Promise<T>(fn);

describe('tiempo real', () => {
  it('rechaza sockets sin sesión', async () => {
    server = await listenWithRealtime();
    const err = await once<Error>((r) => client().on('connect_error', r));
    expect(err.message).toBe('unauthorized');
  });

  it('presencia: ambos ven quién está conectado a la partida', async () => {
    server = await listenWithRealtime();
    const { app } = server;
    const gm = await registerUser(app, 'eldm');
    const pl = await registerUser(app, 'jugador');
    const { campaign } = (
      await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })
    ).json();
    await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: pl.cookie }, payload: { inviteCode: campaign.inviteCode } });

    const a = client(gm.cookie);
    const joinA = await once<{ ok: boolean }>((r) => a.emit('campaign:join', { campaignId: campaign.id }, r as never));
    expect(joinA.ok).toBe(true);

    const seenByGm = once<PresenceUser[]>((r) =>
      a.on('presence:update', ({ online }) => {
        if (online.length === 2) r(online);
      }),
    );
    const b = client(pl.cookie);
    await once((r) => b.emit('campaign:join', { campaignId: campaign.id }, r as never));
    expect((await seenByGm).map((u) => u.displayName).sort()).toEqual(['ELDM', 'JUGADOR']);

    const afterLeave = once<PresenceUser[]>((r) =>
      a.on('presence:update', ({ online }) => {
        if (online.length === 1) r(online);
      }),
    );
    b.close();
    expect((await afterLeave)[0]?.displayName).toBe('ELDM');
  });

  it('no deja entrar en la sala de una partida ajena', async () => {
    server = await listenWithRealtime();
    const gm = await registerUser(server.app, 'eldm');
    const other = await registerUser(server.app, 'otro');
    const { campaign } = (
      await server.app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })
    ).json();
    const res = await once<{ ok: boolean }>((r) => client(other.cookie).emit('campaign:join', { campaignId: campaign.id }, r as never));
    expect(res.ok).toBe(false);
  });
});
