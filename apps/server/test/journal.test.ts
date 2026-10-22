import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, Handout, ServerToClientEvents } from '@vtt/shared';
import { listenWithRealtime, registerUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: Awaited<ReturnType<typeof listenWithRealtime>>;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.app.close();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const ana = await registerUser(app, 'ana');
  const bob = await registerUser(app, 'bob');
  const { campaign } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })).json();
  for (const u of [ana, bob])
    await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: u.cookie }, payload: { inviteCode: campaign.inviteCode } });
  const mk = async (cookie: string) => {
    const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    clients.push(c);
    await new Promise<AckResult<unknown>>((r) => (c.emit as (...a: unknown[]) => void)('campaign:join', { campaignId: campaign.id }, r));
    const events: { ev: string; p: unknown }[] = [];
    c.onAny((ev, p) => events.push({ ev, p }));
    return { c, events };
  };
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  return { gm, ana, bob, campaign, req, anaC: await mk(ana.cookie), bobC: await mk(bob.cookie) };
}

describe('diario', () => {
  it('el DM crea documentos; cada jugador ve solo lo compartido y nunca las notas del DM', async () => {
    const { gm, ana, bob, campaign, req, anaC, bobC } = await setup();
    const created = await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/handouts`, { title: 'Carta del duque', body: '# Querido...', gmNotes: 'Es falsa' });
    expect(created.statusCode).toBe(201);
    const h: Handout = created.json().handout;
    expect(h).toMatchObject({ visibleToAll: false, sharedWith: [] });

    // Aún nadie la ve.
    expect((await req(ana.cookie, 'GET', `/campaigns/${campaign.id}/handouts`)).json().handouts).toEqual([]);
    expect((await req(ana.cookie, 'GET', `/handouts/${h.id}`)).statusCode).toBe(404);
    expect((await req(ana.cookie, 'POST', `/campaigns/${campaign.id}/handouts`, { title: 'X' })).statusCode).toBe(403);

    // Se comparte solo con Ana.
    await req(gm.cookie, 'PATCH', `/handouts/${h.id}`, { sharedWith: [ana.user.id, 'desconocido'] });
    await sleep(50);
    const got = anaC.events.find((e) => e.ev === 'handout:upserted')?.p as { handout: Handout };
    expect(got.handout).toMatchObject({ title: 'Carta del duque', gmNotes: '', sharedWith: [ana.user.id] });
    expect(bobC.events.some((e) => e.ev === 'handout:upserted')).toBe(false);
    expect((await req(ana.cookie, 'GET', `/handouts/${h.id}`)).json().handout.gmNotes).toBe('');

    // Enseñarla: solo se abre a quien puede verla.
    expect((await req(ana.cookie, 'POST', `/handouts/${h.id}/show`)).statusCode).toBe(403);
    await req(gm.cookie, 'POST', `/handouts/${h.id}/show`);
    await sleep(50);
    expect(anaC.events.some((e) => e.ev === 'handout:show')).toBe(true);
    expect(bobC.events.some((e) => e.ev === 'handout:show')).toBe(false);

    // Dejar de compartir: a Ana le desaparece.
    await req(gm.cookie, 'PATCH', `/handouts/${h.id}`, { sharedWith: [] });
    await sleep(50);
    expect(anaC.events.some((e) => e.ev === 'handout:removed')).toBe(true);

    // Para todos y borrar.
    await req(gm.cookie, 'PATCH', `/handouts/${h.id}`, { visibleToAll: true });
    expect((await req(bob.cookie, 'GET', `/campaigns/${campaign.id}/handouts`)).json().handouts).toHaveLength(1);
    expect((await req(bob.cookie, 'DELETE', `/handouts/${h.id}`)).statusCode).toBe(403);
    expect((await req(gm.cookie, 'DELETE', `/handouts/${h.id}`)).statusCode).toBe(200);
    expect((await req(bob.cookie, 'GET', `/campaigns/${campaign.id}/handouts`)).json().handouts).toEqual([]);
  });
});
