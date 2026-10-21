import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, ClientToServerEvents, SceneState, ServerToClientEvents } from '@vtt/shared';
import { listenWithRealtime, registerUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: Awaited<ReturnType<typeof listenWithRealtime>>;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.app.close();
});

function client(cookie: string): Client {
  const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
  clients.push(c);
  return c;
}

/** Emite un evento con ack y devuelve la respuesta. */
function call<T>(c: Client, event: keyof ClientToServerEvents, payload: unknown): Promise<AckResult<T>> {
  return new Promise((resolve) => (c.emit as (...a: unknown[]) => void)(event, payload, resolve));
}
function ok<T>(res: AckResult<T>): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
const next = <K extends keyof ServerToClientEvents>(c: Client, ev: K) =>
  new Promise<Parameters<ServerToClientEvents[K]>[0]>((r) => c.once(ev, r as never));
const tick = () => new Promise((r) => setTimeout(r, 80));

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'jugador');
  const { campaign } = (
    await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })
  ).json();
  await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: pl.cookie }, payload: { inviteCode: campaign.inviteCode } });
  const sceneId: string = campaign.activeSceneId;
  const gmC = client(gm.cookie);
  const plC = client(pl.cookie);
  ok(await call<SceneState>(gmC, 'scene:view', { sceneId }));
  ok(await call<SceneState>(plC, 'scene:view', { sceneId }));
  const token = (layer: 'map' | 'token' | 'gm', extra: object = {}) =>
    call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer, x: 0, y: 0, width: 70, height: 70, ...extra } }).then(ok);
  return { app, gm, pl, campaign, sceneId, gmC, plC, token };
}

describe('tablero', () => {
  it('una partida nueva trae una escena activa; el jugador solo ve la activa', async () => {
    const { app, gm, pl, campaign, sceneId } = await setup();
    expect(sceneId).toBeTruthy();
    await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/scenes`, headers: { cookie: gm.cookie }, payload: { name: 'Mazmorra' } });
    const gmList = (await app.inject({ url: `/api/campaigns/${campaign.id}/scenes`, headers: { cookie: gm.cookie } })).json();
    const plList = (await app.inject({ url: `/api/campaigns/${campaign.id}/scenes`, headers: { cookie: pl.cookie } })).json();
    expect(gmList.scenes).toHaveLength(2);
    expect(plList.scenes.map((s: { id: string }) => s.id)).toEqual([sceneId]);
  });

  it('el jugador no puede abrir una escena que no es la activa', async () => {
    const { app, gm, campaign, plC } = await setup();
    const { scene } = (
      await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/scenes`, headers: { cookie: gm.cookie }, payload: { name: 'Secreta' } })
    ).json();
    const res = await call(plC, 'scene:view', { sceneId: scene.id });
    expect(res.ok).toBe(false);
  });

  it('la capa del DM no llega a los jugadores; al pasarla a tokens, aparece', async () => {
    const { gmC, plC, sceneId } = await setup();
    const seen: string[] = [];
    plC.on('item:upserted', ({ item }) => seen.push(item.id));
    const hidden = await token('gm');
    await tick();
    expect(seen).not.toContain(hidden.id);

    const appeared = next(plC, 'item:upserted');
    ok(await call(gmC, 'item:update', { sceneId, id: hidden.id, patch: { layer: 'token' } }));
    expect((await appeared).item.id).toBe(hidden.id);

    const gone = next(plC, 'item:removed');
    ok(await call(gmC, 'item:update', { sceneId, id: hidden.id, patch: { layer: 'gm' } }));
    expect((await gone).id).toBe(hidden.id);

    async function token(layer: 'gm') {
      return ok(await call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer, x: 0, y: 0, width: 70, height: 70 } }));
    }
  });

  it('niebla: lo que no está revelado no llega; al revelar, el jugador recibe el estado nuevo', async () => {
    const { gmC, plC, sceneId, pl, token } = await setup();
    ok(await call(gmC, 'fog:set', { sceneId, fog: { enabled: true, ops: [] } }));
    const enemy = await token('token', { x: 700, y: 700 });
    const mine = await token('token', { x: 700, y: 0, ownerIds: [pl.user.id] });

    const view = ok(await call<SceneState>(plC, 'scene:view', { sceneId }));
    expect(view.items.map((i) => i.id)).toEqual([mine.id]);

    const sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'fog:add', { sceneId, op: { mode: 'reveal', x: 650, y: 650, w: 200, h: 200 } }));
    expect((await sync).items.map((i) => i.id).sort()).toEqual([enemy.id, mine.id].sort());
  });

  it('el jugador mueve sus tokens, pero no los ajenos ni otros campos', async () => {
    const { gmC, plC, sceneId, pl, token } = await setup();
    const mine = await token('token', { ownerIds: [pl.user.id] });
    const other = await token('token');

    const moved = next(gmC, 'item:upserted');
    ok(await call(plC, 'item:update', { sceneId, id: mine.id, patch: { x: 140, y: 70 } }));
    expect((await moved).item).toMatchObject({ id: mine.id, x: 140, y: 70 });

    expect((await call(plC, 'item:update', { sceneId, id: other.id, patch: { x: 1 } })).ok).toBe(false);
    expect((await call(plC, 'item:update', { sceneId, id: mine.id, patch: { name: 'Hack' } })).ok).toBe(false);
    expect((await call(plC, 'item:create', { sceneId, item: { layer: 'token', x: 0, y: 0, width: 1, height: 1 } })).ok).toBe(false);
    expect((await call(plC, 'item:delete', { sceneId, id: mine.id })).ok).toBe(false);
  });

  it('el arrastre en vivo llega a los demás', async () => {
    const { gmC, plC, sceneId, pl, token } = await setup();
    const mine = await token('token', { ownerIds: [pl.user.id] });
    const moving = next(gmC, 'item:moving');
    plC.emit('item:moving', { sceneId, id: mine.id, x: 33, y: 44 });
    expect(await moving).toMatchObject({ id: mine.id, x: 33, y: 44 });
  });

  it('cambiar la escena activa avisa y saca a los jugadores de la anterior', async () => {
    const { app, gm, campaign, gmC, plC, sceneId, token } = await setup();
    const { scene } = (
      await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/scenes`, headers: { cookie: gm.cookie }, payload: { name: 'B' } })
    ).json();
    ok(await call(plC, 'campaign:join', { campaignId: campaign.id }));
    const changed = next(plC, 'scene:activeChanged');
    await app.inject({ method: 'PUT', url: `/api/campaigns/${campaign.id}/active-scene`, headers: { cookie: gm.cookie }, payload: { sceneId: scene.id } });
    expect((await changed).sceneId).toBe(scene.id);

    const seen: string[] = [];
    plC.on('item:upserted', ({ item }) => seen.push(item.id));
    const t = await token('map');
    await tick();
    expect(seen).not.toContain(t.id);
    expect(sceneId).not.toBe(scene.id);
    void gmC;
  });
});

describe('archivos', () => {
  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  function multipart(buf: Buffer, filename: string, mime: string) {
    const boundary = '----vtt';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  }

  it('el DM sube una imagen; los miembros la ven y los ajenos no', async () => {
    server = await listenWithRealtime();
    const { app } = server;
    const gm = await registerUser(app, 'eldm');
    const stranger = await registerUser(app, 'ajeno');
    const { campaign } = (
      await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })
    ).json();
    const mp = multipart(PNG_1x1, 'mapa.png', 'image/png');
    const up = await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/assets`, payload: mp.payload, headers: { ...mp.headers, cookie: gm.cookie } });
    expect(up.statusCode).toBe(201);
    const { asset } = up.json();
    expect(asset).toMatchObject({ width: 1, height: 1, mime: 'image/png' });

    const get = await app.inject({ url: `/api/assets/${asset.id}`, headers: { cookie: gm.cookie } });
    expect(get.statusCode).toBe(200);
    expect(get.rawPayload.equals(PNG_1x1)).toBe(true);
    expect((await app.inject({ url: `/api/assets/${asset.id}`, headers: { cookie: stranger.cookie } })).statusCode).toBe(404);

    const bad = multipart(Buffer.from('hola'), 'x.txt', 'text/plain');
    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/assets`, payload: bad.payload, headers: { ...bad.headers, cookie: gm.cookie } });
    expect(res.statusCode).toBe(400);
  });
});
