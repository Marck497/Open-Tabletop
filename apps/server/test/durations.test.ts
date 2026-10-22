import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, ChatMessage, ClientToServerEvents, SceneState, ServerToClientEvents } from '@vtt/shared';
import { listenWithRealtime, registerUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: Awaited<ReturnType<typeof listenWithRealtime>>;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.app.close();
});

const call = <T,>(c: Client, event: keyof ClientToServerEvents, payload: unknown): Promise<AckResult<T>> =>
  new Promise((resolve) => (c.emit as (...a: unknown[]) => void)(event, payload, resolve));
function ok<T>(res: AckResult<T>): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
const tick = () => new Promise((r) => setTimeout(r, 100));

describe('duración de los estados en rondas', () => {
  it('cada turno del token resta una ronda y al acabar se quita el estado', async () => {
    server = await listenWithRealtime();
    const { app } = server;
    const gm = await registerUser(app, 'eldm');
    const pl = await registerUser(app, 'jugadora');
    const { campaign } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })).json();
    await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: pl.cookie }, payload: { inviteCode: campaign.inviteCode } });
    const sceneId: string = campaign.activeSceneId;
    const gmC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: gm.cookie }, reconnection: false });
    const plC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: pl.cookie }, reconnection: false });
    clients.push(gmC, plC);
    ok(await call(gmC, 'campaign:join', { campaignId: campaign.id }));
    ok(await call(plC, 'campaign:join', { campaignId: campaign.id }));
    ok(await call<SceneState>(gmC, 'scene:view', { sceneId }));
    const mk = (item: object) => call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer: 'token', x: 0, y: 0, width: 70, height: 70, ...item } }).then(ok);
    const ogre = await mk({ name: 'Ogro', statuses: ['derribado', 'cegado', 'marcado'], statusRounds: { derribado: 2, cegado: 1, asustado: 5 } });
    // Las duraciones de estados que no tiene no se guardan.
    expect(ogre.statusRounds).toEqual({ derribado: 2, cegado: 1 });
    const hero = await mk({ name: 'Heroína', ownerIds: [pl.user.id] });
    const init = (action: object) => call(gmC, 'initiative:action', { campaignId: campaign.id, ...action }).then(ok);
    await init({ type: 'add', entry: { name: 'Ogro', value: 20, itemId: ogre.id, characterId: null, hidden: false } });
    await init({ type: 'add', entry: { name: 'Heroína', value: 10, itemId: hero.id, characterId: null, hidden: false } });
    const messages: ChatMessage[] = [];
    plC.on('chat:message', (m) => messages.push(m));
    const now = async () => ok(await call<SceneState>(gmC, 'scene:view', { sceneId })).items.find((i) => i.id === ogre.id)!;

    // Empieza el combate: turno del ogro. Se le acaba la ceguera y le queda 1 ronda derribado.
    await init({ type: 'start' });
    await tick();
    let o = await now();
    expect(o.statuses).toEqual(['derribado', 'marcado']);
    expect(o.statusRounds).toEqual({ derribado: 1 });
    expect(messages.map((m) => m.text)).toEqual(['⏳ Ogro: se acaba cegado']);
    // Turno de la heroína: el ogro no cambia.
    await init({ type: 'next' });
    await tick();
    expect((await now()).statusRounds).toEqual({ derribado: 1 });
    // Ronda 2, turno del ogro: se levanta. El estado sin duración se queda.
    await init({ type: 'next' });
    await tick();
    o = await now();
    expect(o.statuses).toEqual(['marcado']);
    expect(o.statusRounds).toEqual({});
    expect(messages.at(-1)?.text).toBe('⏳ Ogro: se acaba derribado');
    // Quitar un estado a mano olvida su duración.
    const withTimer = ok(await call<BoardItem>(gmC, 'item:update', { sceneId, id: ogre.id, patch: { statuses: ['marcado', 'aturdido'], statusRounds: { aturdido: 3 } } }));
    expect(withTimer.statusRounds).toEqual({ aturdido: 3 });
    expect(ok(await call<BoardItem>(gmC, 'item:update', { sceneId, id: ogre.id, patch: { statuses: ['marcado'] } })).statusRounds).toEqual({});
  });
});
