import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, ClientToServerEvents, SceneState, ServerToClientEvents } from '@vtt/shared';
import { paintRect, withAutoWalls } from '@vtt/shared';
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
  it('dibujos: los jugadores dibujan en la capa de tokens y solo borran o editan los suyos', async () => {
    const { pl, sceneId, gmC, plC, token } = await setup();
    const drawing = { type: 'path', points: [0, 0, 10, 10, 20, 0], stroke: '#ff0000' };
    // Aunque pida la capa del DM y otros dueños, se fuerza la de tokens y él como dueño.
    const mine = ok(
      await call<BoardItem>(plC, 'item:create', { sceneId, item: { layer: 'gm', x: 0, y: 0, width: 20, height: 10, ownerIds: [], drawing } }),
    );
    expect(mine).toMatchObject({ layer: 'token', ownerIds: [pl.user.id], drawing: { type: 'path', strokeWidth: 4 } });
    // No puede crear tokens.
    expect((await call(plC, 'item:create', { sceneId, item: { layer: 'token', x: 0, y: 0, width: 70, height: 70 } })).ok).toBe(false);
    // Puede redimensionar su dibujo.
    expect((await call(plC, 'item:update', { sceneId, id: mine.id, patch: { width: 40, height: 20, drawing: { ...drawing, points: [0, 0, 20, 20, 40, 0] } } })).ok).toBe(true);
    // No puede borrar ni dibujos del DM ni tokens.
    const gmDrawing = await token('token', { drawing: { type: 'text', text: 'Aquí' } });
    const tok = await token('token');
    expect((await call(plC, 'item:delete', { sceneId, id: gmDrawing.id })).ok).toBe(false);
    expect((await call(plC, 'item:delete', { sceneId, id: tok.id })).ok).toBe(false);
    const removed = next(gmC, 'item:removed');
    expect((await call(plC, 'item:delete', { sceneId, id: mine.id })).ok).toBe(true);
    expect((await removed).id).toBe(mine.id);
  });

  it('estados: el jugador marca los de su token, no los de otros', async () => {
    const { pl, sceneId, plC, token } = await setup();
    const mine = await token('token', { ownerIds: [pl.user.id] });
    const other = await token('token');
    const res = await call<BoardItem>(plC, 'item:update', { sceneId, id: mine.id, patch: { statuses: ['derribado', 'concentracion'] } });
    expect(ok(res).statuses).toEqual(['derribado', 'concentracion']);
    expect((await call(plC, 'item:update', { sceneId, id: other.id, patch: { statuses: ['muerto'] } })).ok).toBe(false);
    // Un jugador no puede tocar otras cosas de su token (p. ej. la capa).
    expect((await call(plC, 'item:update', { sceneId, id: mine.id, patch: { layer: 'gm' } })).ok).toBe(false);
  });

  it('reglas y pings se reenvían a la escena; los del DM pueden ser solo para DM', async () => {
    const { gm, sceneId, gmC, plC } = await setup();
    const measure = { shape: 'ruler', points: [{ x: 35, y: 35 }, { x: 315, y: 35 }] };
    const seen = next(gmC, 'board:measure');
    plC.emit('board:measure', { sceneId, measure } as never);
    expect(await seen).toMatchObject({ sceneId, name: 'JUGADOR', measure });

    // Medición secreta del DM: el jugador no la recibe.
    let leaked = false;
    plC.on('board:measure', () => (leaked = true));
    gmC.emit('board:measure', { sceneId, measure, gmOnly: true } as never);
    await tick();
    expect(leaked).toBe(false);

    // Un jugador no puede forzar el "centrar vista"; el DM sí.
    const ping1 = next(gmC, 'board:ping');
    plC.emit('board:ping', { sceneId, x: 10, y: 20, focus: true });
    expect(await ping1).toMatchObject({ x: 10, y: 20, focus: false });
    const ping2 = next(plC, 'board:ping');
    gmC.emit('board:ping', { sceneId, x: 1, y: 2, focus: true });
    expect(await ping2).toMatchObject({ userId: gm.user.id, focus: true });

    // Datos inválidos se ignoran sin romper nada.
    plC.emit('board:measure', { sceneId, measure: { shape: 'nada', points: [] } } as never);
    // Al desconectarse, su regla desaparece para los demás.
    const cleared = next(gmC, 'board:measure');
    plC.close();
    expect(await cleared).toMatchObject({ measure: null });
  });

  it('las escenas guardan la distancia por casilla y la regla de diagonales', async () => {
    const { app, gm, sceneId } = await setup();
    const res = await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { cellDistance: 1.5, distanceUnit: 'm', diagonalRule: 'alt' } });
    expect(res.json().scene).toMatchObject({ cellDistance: 1.5, distanceUnit: 'm', diagonalRule: 'alt' });
    const bad = await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { diagonalRule: 'raro' } });
    expect(bad.statusCode).toBe(400);
  });

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

describe('escenas por jugador y carpetas', () => {
  it('el DM lleva a un jugador aparte; el otro se queda con la party y cada uno solo ve la suya', async () => {
    const { app, gm, pl, campaign, sceneId, plC } = await setup();
    const pl2 = await registerUser(app, 'otro');
    await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: pl2.cookie }, payload: { inviteCode: campaign.inviteCode } });
    const api = (method: 'GET' | 'PUT' | 'POST', url: string, cookie: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
    const { scene: side } = (await api('POST', `/campaigns/${campaign.id}/scenes`, gm.cookie, { name: 'Cripta' })).json();

    ok(await call(plC, 'campaign:join', { campaignId: campaign.id }));
    const changed = next(plC, 'scene:activeChanged');
    expect((await api('PUT', `/campaigns/${campaign.id}/player-scene`, gm.cookie, { sceneId: side.id, userIds: [pl.user.id] })).statusCode).toBe(200);
    await changed;
    // Lo que ve cada uno.
    expect((await api('GET', `/campaigns/${campaign.id}`, pl.cookie)).json().campaign.activeSceneId).toBe(side.id);
    expect((await api('GET', `/campaigns/${campaign.id}`, pl2.cookie)).json().campaign.activeSceneId).toBe(sceneId);
    const gmView = (await api('GET', `/campaigns/${campaign.id}`, gm.cookie)).json().campaign;
    expect(gmView.activeSceneId).toBe(sceneId);
    expect(gmView.members.find((m: { id: string }) => m.id === pl.user.id).sceneId).toBe(side.id);
    expect((await api('GET', `/campaigns/${campaign.id}`, pl2.cookie)).json().campaign.members.every((m: { sceneId?: string }) => m.sceneId === undefined)).toBe(true);
    expect((await api('GET', `/campaigns/${campaign.id}/scenes`, pl.cookie)).json().scenes.map((s: { id: string }) => s.id)).toEqual([side.id]);
    // Acceso: el jugador apartado ya no entra en la de la party, y el otro no entra en la cripta.
    expect((await call(plC, 'scene:view', { sceneId })).ok).toBe(false);
    ok(await call(plC, 'scene:view', { sceneId: side.id }));
    const pl2C = client(pl2.cookie);
    expect((await call(pl2C, 'scene:view', { sceneId: side.id })).ok).toBe(false);
    // Solo el DM y solo jugadores.
    expect((await api('PUT', `/campaigns/${campaign.id}/player-scene`, pl.cookie, { sceneId, userIds: [pl.user.id] })).statusCode).toBe(403);
    expect((await api('PUT', `/campaigns/${campaign.id}/player-scene`, gm.cookie, { sceneId, userIds: [gm.user.id] })).statusCode).toBe(400);

    // "Toda la party" los junta a todos.
    await api('PUT', `/campaigns/${campaign.id}/active-scene`, gm.cookie, { sceneId: side.id });
    expect((await api('GET', `/campaigns/${campaign.id}`, pl2.cookie)).json().campaign.activeSceneId).toBe(side.id);
    // Llevar a uno a la escena de la party lo deja "con la party" y sigue a la party después.
    await api('PUT', `/campaigns/${campaign.id}/player-scene`, gm.cookie, { sceneId, userIds: [pl.user.id] });
    await api('PUT', `/campaigns/${campaign.id}/player-scene`, gm.cookie, { sceneId: side.id, userIds: [pl.user.id] });
    await api('PUT', `/campaigns/${campaign.id}/active-scene`, gm.cookie, { sceneId });
    expect((await api('GET', `/campaigns/${campaign.id}`, pl.cookie)).json().campaign.activeSceneId).toBe(sceneId);
    // Si borran la escena en la que estaba aparte, vuelve con la party.
    await api('PUT', `/campaigns/${campaign.id}/player-scene`, gm.cookie, { sceneId: side.id, userIds: [pl.user.id] });
    await app.inject({ method: 'DELETE', url: `/api/scenes/${side.id}`, headers: { cookie: gm.cookie } });
    expect((await api('GET', `/campaigns/${campaign.id}`, pl.cookie)).json().campaign.activeSceneId).toBe(sceneId);
  });

  it('el jugador apartado deja de recibir los cambios de la escena de la party', async () => {
    const { app, gm, pl, campaign, plC, token } = await setup();
    const { scene: side } = (
      await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/scenes`, headers: { cookie: gm.cookie }, payload: { name: 'Aparte' } })
    ).json();
    ok(await call(plC, 'campaign:join', { campaignId: campaign.id }));
    await app.inject({ method: 'PUT', url: `/api/campaigns/${campaign.id}/player-scene`, headers: { cookie: gm.cookie }, payload: { sceneId: side.id, userIds: [pl.user.id] } });
    const seen: string[] = [];
    plC.on('item:upserted', ({ item }) => seen.push(item.id));
    const t = await token('map');
    await tick();
    expect(seen).not.toContain(t.id);
  });

  it('carpetas: anidar, ordenar, sin bucles, y al borrar una su contenido sube', async () => {
    const { app, gm, pl, campaign, sceneId } = await setup();
    const api = (method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, cookie = gm.cookie) =>
      app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
    const a = (await api('POST', `/campaigns/${campaign.id}/scene-folders`, { name: 'Acto 1' })).json().folder;
    const b = (await api('POST', `/campaigns/${campaign.id}/scene-folders`, { name: 'Mazmorras', parentId: a.id })).json().folder;
    expect(b.parentId).toBe(a.id);
    expect((await api('POST', `/campaigns/${campaign.id}/scene-folders`, { name: 'X' }, pl.cookie)).statusCode).toBe(403);
    const { scene } = (await api('POST', `/campaigns/${campaign.id}/scenes`, { name: 'Cripta', folderId: b.id })).json();
    expect(scene.folderId).toBe(b.id);
    expect((await api('PATCH', `/scene-folders/${a.id}`, { name: 'Acto I' })).json().folder.name).toBe('Acto I');
    // Bucle: meter Acto I dentro de su propia subcarpeta.
    expect((await api('PUT', `/campaigns/${campaign.id}/scene-tree`, { folders: [{ id: a.id, parentId: b.id, sortOrder: 0 }] })).statusCode).toBe(400);
    expect((await api('PUT', `/campaigns/${campaign.id}/scene-tree`, { scenes: [{ id: sceneId, folderId: a.id, sortOrder: 3 }] })).statusCode).toBe(200);
    let list = (await api('GET', `/campaigns/${campaign.id}/scenes`)).json();
    expect(list.folders).toHaveLength(2);
    expect(list.scenes.find((s: { id: string }) => s.id === sceneId)).toMatchObject({ folderId: a.id, sortOrder: 3 });
    // Los jugadores no ven las carpetas.
    expect((await api('GET', `/campaigns/${campaign.id}/scenes`, undefined, pl.cookie)).json().folders).toEqual([]);
    // Borrar "Mazmorras": la cripta sube a "Acto I".
    await api('DELETE', `/scene-folders/${b.id}`);
    list = (await api('GET', `/campaigns/${campaign.id}/scenes`)).json();
    expect(list.folders.map((f: { name: string }) => f.name)).toEqual(['Acto I']);
    expect(list.scenes.find((s: { id: string }) => s.id === scene.id).folderId).toBe(a.id);
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

describe('paredes y visión', () => {
  it('el jugador solo ve lo que ve su token, no atraviesa paredes y abre puertas sin llave', async () => {
    const { app, gm, pl, sceneId, gmC, plC, token } = await setup();
    const hero = await token('token', { x: 0, y: 140, ownerIds: [pl.user.id] });
    const orc = await token('token', { x: 280, y: 140 });
    const wall = (id: string, kind: string, extra: object = {}) => ({ id, x1: 210, y1: 0, x2: 210, y2: 1400, kind, ...extra });
    // Solo el DM pone paredes.
    expect((await call(plC, 'walls:set', { sceneId, walls: [wall('w1', 'wall')] })).ok).toBe(false);

    // Activar la visión: al jugador le llega la escena refiltrada (sin paredes aún, ve al orco).
    let sync = next(plC, 'scene:sync');
    const gmSaw = next(gmC, 'scene:updated');
    await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { vision: true } });
    expect((await sync).items.map((i) => i.id)).toContain(orc.id);
    expect((await gmSaw).scene.vision).toBe(true);

    // Una puerta secreta en medio: deja de ver al orco y la ve como pared.
    sync = next(plC, 'scene:sync');
    const updated = next(gmC, 'scene:updated');
    ok(await call(gmC, 'walls:set', { sceneId, walls: [wall('s1', 'secret')] }));
    let state = await sync;
    expect(state.items.map((i) => i.id)).toEqual([hero.id]);
    expect(state.scene.walls[0]).toMatchObject({ id: 's1', kind: 'wall' });
    expect((await updated).scene.walls[0]).toMatchObject({ kind: 'secret' });
    // No la puede abrir ni atravesar.
    expect((await call(plC, 'door:toggle', { sceneId, wallId: 's1', open: true })).ok).toBe(false);
    const blocked = await call(plC, 'item:update', { sceneId, id: hero.id, patch: { x: 420, y: 140 } });
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.error).toMatch(/pared/);
    // Lo que se mueve al otro lado no le llega.
    let got = false;
    plC.once('item:upserted', () => (got = true));
    ok(await call(gmC, 'item:update', { sceneId, id: orc.id, patch: { x: 350 } }));
    await tick();
    expect(got).toBe(false);

    // Puerta normal con llave: no la abre; sin llave, sí, y entonces ve al orco.
    sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'walls:set', { sceneId, walls: [wall('d1', 'door', { locked: true })] }));
    await sync;
    expect((await call(plC, 'door:toggle', { sceneId, wallId: 'd1', open: true })).ok).toBe(false);
    expect((await call(plC, 'door:toggle', { sceneId, wallId: 'd1', locked: false })).ok).toBe(false);
    sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'door:toggle', { sceneId, wallId: 'd1', locked: false }));
    await sync;
    sync = next(plC, 'scene:sync');
    ok(await call(plC, 'door:toggle', { sceneId, wallId: 'd1', open: true }));
    state = await sync;
    expect(state.items.map((i) => i.id)).toContain(orc.id);
    // Con la puerta abierta ya puede pasar; al moverse le llega la escena entera otra vez.
    sync = next(plC, 'scene:sync');
    ok(await call(plC, 'item:update', { sceneId, id: hero.id, patch: { x: 280, y: 210 } }));
    expect((await sync).items.length).toBe(2);

    // Alcance de visión: a 1 casilla ya no ve al orco (está a más de 70 px).
    sync = next(plC, 'scene:sync');
    ok(await call(plC, 'item:update', { sceneId, id: hero.id, patch: { x: 0, y: 140 } }));
    await sync;
    sync = next(plC, 'scene:sync');
    await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { visionRange: 1 } });
    expect((await sync).items.map((i) => i.id)).toEqual([hero.id]);
  });

  it('rodear una pared con puntos de giro: cada tramo se comprueba', async () => {
    const { pl, sceneId, gmC, plC, token } = await setup();
    // Pared de x=210 que llega hasta y=700: por debajo se puede pasar.
    ok(await call(gmC, 'walls:set', { sceneId, walls: [{ id: 'w', x1: 210, y1: 0, x2: 210, y2: 700, kind: 'wall' }] }));
    const hero = await token('token', { x: 0, y: 140, ownerIds: [pl.user.id] });
    const move = (path?: object[]) => call<BoardItem>(plC, 'item:update', { sceneId, id: hero.id, patch: { x: 280, y: 140 }, path });

    expect(await move()).toMatchObject({ ok: false });
    // Un giro que sigue chocando con la pared tampoco vale.
    expect(await move([{ x: 35, y: 400 }])).toMatchObject({ ok: false });
    expect(await move([{ x: 35, y: 805 }, { x: 315, y: 805 }])).toMatchObject({ ok: true });
    // El rodeo de vuelta también.
    expect((await call(plC, 'item:update', { sceneId, id: hero.id, patch: { x: 0, y: 140 }, path: [{ x: 315, y: 805 }, { x: 35, y: 805 }] })).ok).toBe(true);
    // Demasiados giros: se rechaza.
    expect(await move(Array.from({ length: 31 }, () => ({ x: 35, y: 805 })))).toMatchObject({ ok: false });
  });

  it('recuerda lo explorado por escena sin enseñar los tokens que hay ahí, y el DM lo olvida', async () => {
    const { app, gm, pl, sceneId, gmC, plC, token } = await setup();
    const hero = await token('token', { x: 0, y: 140, ownerIds: [pl.user.id] });
    const orc = await token('token', { x: 280, y: 140 });
    ok(await call(gmC, 'walls:set', { sceneId, walls: [{ id: 'd1', x1: 210, y1: 0, x2: 210, y2: 1400, kind: 'door' }] }));
    // Al activar la visión se marca lo que ve el héroe (solo su lado de la puerta).
    let explored = next(plC, 'explored:updated');
    await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { vision: true } });
    const first = (await explored).explored;
    expect(first).not.toBe('');
    // Abre la puerta, pasa y vuelve: lo explorado crece y se queda, pero el orco ya no le llega.
    explored = next(plC, 'explored:updated');
    ok(await call(plC, 'door:toggle', { sceneId, wallId: 'd1', open: true }));
    const second = (await explored).explored;
    expect(second).not.toBe(first);
    let sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'door:toggle', { sceneId, wallId: 'd1', open: false }));
    const state = await sync;
    expect(state.scene.explored).toBe(second);
    expect(state.items.map((i) => i.id)).toEqual([hero.id]);
    expect(orc.id).toBeTruthy();
    // Sigue guardado al volver a abrir la escena.
    expect(ok(await call<SceneState>(plC, 'scene:view', { sceneId })).scene.explored).toBe(second);
    // Solo el DM lo olvida; queda lo que se ve ahora.
    expect((await call(plC, 'explored:reset', { sceneId })).ok).toBe(false);
    explored = next(plC, 'explored:updated');
    ok(await call(gmC, 'explored:reset', { sceneId }));
    expect((await explored).explored).toBe(first);
    // Desactivado: ya no se apunta nada nuevo.
    await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { exploration: false } });
    sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'door:toggle', { sceneId, wallId: 'd1', open: true }));
    expect((await sync).scene.explored).toBe(first);
  });

  it('a oscuras: solo ve lo iluminado o lo que alcanza su visión en la oscuridad', async () => {
    const { app, gm, pl, sceneId, gmC, plC, token } = await setup();
    const hero = await token('token', { x: 0, y: 140, ownerIds: [pl.user.id] });
    // El orco está a 7 casillas (35 pies) del héroe.
    const orc = await token('token', { x: 490, y: 140 });
    let sync = next(plC, 'scene:sync');
    await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { vision: true, lighting: true } });
    let state = await sync;
    expect(state.items.map((i) => i.id)).toEqual([hero.id]);
    expect(state.lights).toEqual([]);
    // Con visión en la oscuridad de 60 pies ya lo ve.
    sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'item:update', { sceneId, id: hero.id, patch: { darkvision: 60 } }));
    expect((await sync).items.map((i) => i.id)).toContain(orc.id);
    // Sin ella, una antorcha en la capa del DM al lado del orco lo ilumina (y el jugador recibe la luz, no el elemento).
    sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'item:update', { sceneId, id: hero.id, patch: { darkvision: 0 } }));
    await sync;
    sync = next(plC, 'scene:sync');
    const torch = await token('gm', { x: 560, y: 140, light: { bright: 20, dim: 20 } });
    state = await sync;
    expect(state.items.map((i) => i.id).sort()).toEqual([hero.id, orc.id].sort());
    expect(state.lights).toHaveLength(1);
    expect(state.lights![0]).toMatchObject({ x: 595, y: 175, bright: 280, radius: 560 });
    // Una pared tapa la antorcha: ni orco ni luz.
    sync = next(plC, 'scene:sync');
    ok(await call(gmC, 'walls:set', { sceneId, walls: [{ id: 'w', x1: 420, y1: 0, x2: 420, y2: 1400, kind: 'wall' }] }));
    state = await sync;
    expect(state.items.map((i) => i.id)).toEqual([hero.id]);
    expect(state.lights).toEqual([]);
    // El jugador enciende y apaga la antorcha de su token, pero no se pone visión en la oscuridad.
    sync = next(plC, 'scene:sync');
    ok(await call(plC, 'item:update', { sceneId, id: hero.id, patch: { light: { bright: 20, dim: 20 } } }));
    expect((await sync).lights).toHaveLength(1);
    expect((await call(plC, 'item:update', { sceneId, id: hero.id, patch: { darkvision: 60 } })).ok).toBe(false);
    expect(torch.light).toMatchObject({ bright: 20, dim: 20, color: '#ffb74d' });
  });

  it('visión sin tokens propios: el jugador no ve los tokens ajenos', async () => {
    const { app, gm, sceneId, plC, token } = await setup();
    await token('token', { x: 280, y: 140 });
    const map = await token('map');
    const sync = next(plC, 'scene:sync');
    await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { vision: true } });
    expect((await sync).items.map((i) => i.id)).toEqual([map.id]);
  });
});

describe('notas privadas del DM', () => {
  it('el DM las escribe en un token; a los jugadores nunca les llegan ni las pueden cambiar', async () => {
    const { pl, sceneId, gmC, plC, token } = await setup();
    const npc = await token('token', { x: 70, y: 70, name: 'Tabernero', ownerIds: [pl.user.id], gmNotes: 'Es un espía del duque' });
    expect(npc.gmNotes).toBe('Es un espía del duque');
    const seen = ok(await call<SceneState>(plC, 'scene:view', { sceneId })).items.find((i) => i.id === npc.id);
    expect(seen?.gmNotes).toBe('');
    const upserted = next(plC, 'item:upserted');
    ok(await call(gmC, 'item:update', { sceneId, id: npc.id, patch: { gmNotes: 'Y lleva la llave', x: 140 } }));
    expect((await upserted).item).toMatchObject({ x: 140, gmNotes: '' });
    // Aunque el token sea suyo, el jugador no puede tocarlas, y su respuesta tampoco las trae.
    expect((await call(plC, 'item:update', { sceneId, id: npc.id, patch: { gmNotes: 'hola' } })).ok).toBe(false);
    expect(ok(await call<BoardItem>(plC, 'item:update', { sceneId, id: npc.id, patch: { x: 210 } })).gmNotes).toBe('');
    expect(ok(await call<SceneState>(gmC, 'scene:view', { sceneId })).items.find((i) => i.id === npc.id)?.gmNotes).toBe('Y lleva la llave');
  });
});

describe('editor de mapas', () => {
  it('el DM pinta el suelo con sus paredes; los jugadores lo reciben y no pueden pintar', async () => {
    const { app, gm, sceneId, gmC, plC } = await setup();
    const t = paintRect('', 30, 20, 1, 1, 4, 3, 'p');
    const walls = withAutoWalls([], t, 30, 20, 70);
    expect((await call(plC, 'terrain:set', { sceneId, terrain: t })).ok).toBe(false);
    expect((await call(gmC, 'terrain:set', { sceneId, terrain: 'pp' })).ok).toBe(false); // tamaño que no encaja
    expect((await call(gmC, 'terrain:set', { sceneId, terrain: t.replace('p', '?') })).ok).toBe(false);

    const sync = next(plC, 'scene:sync');
    const updated = next(gmC, 'scene:updated');
    ok(await call(gmC, 'terrain:set', { sceneId, terrain: t, walls }));
    expect((await updated).scene).toMatchObject({ terrain: t, walls: expect.arrayContaining([expect.objectContaining({ auto: true })]) });
    expect((await sync).scene.terrain).toBe(t);

    // Al agrandar la escena el suelo se conserva arriba a la izquierda; sin nada pintado se guarda vacío.
    const res = await app.inject({ method: 'PATCH', url: `/api/scenes/${sceneId}`, headers: { cookie: gm.cookie }, payload: { widthCells: 31 } });
    const { scene } = res.json();
    expect(scene.terrain).toHaveLength(31 * 20);
    expect(scene.terrain.slice(31, 36)).toBe('.pppp');
    ok(await call(gmC, 'terrain:set', { sceneId, terrain: '.'.repeat(31 * 20) }));
    const after = (await app.inject({ url: `/api/campaigns/${scene.campaignId}/scenes`, headers: { cookie: gm.cookie } })).json();
    expect(after.scenes[0].terrain).toBe('');
  });
});

describe('vida y CA en los tokens', () => {
  it('el DM elige qué ven los jugadores de la vida y la CA; los cambios de la hoja llegan solos', async () => {
    const { app, gm, pl, campaign, sceneId, gmC, plC, token } = await setup();
    const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: gm.cookie }, payload });
    const { character: gob } = (await post(`/campaigns/${campaign.id}/compendium/goblin`, {})).json();
    const { character: hero } = (await post(`/campaigns/${campaign.id}/characters`, { name: 'Ana', controlledBy: [pl.user.id] })).json();
    await app.inject({ method: 'PATCH', url: `/api/characters/${hero.id}`, headers: { cookie: gm.cookie }, payload: { values: { pg_max: 20, pg_actuales: 12, pg_temporales: 5, ca: 16 } } });

    const seen = (id: string) => new Promise<BoardItem>((resolve) => plC.on('item:upserted', ({ item }) => item.id === id && resolve(item)));
    let got = seen('?');
    const enemy = await token('token', { characterId: gob.id, x: 140 });
    const own = await token('token', { characterId: hero.id, ownerIds: [pl.user.id], x: 280 });
    // El DM lo ve todo.
    expect(enemy.stats).toMatchObject({ hp: 7, hpMax: 7, ratio: 1, ac: 15 });
    const state = ok(await call<SceneState>(plC, 'scene:view', { sceneId }));
    const byId = (id: string) => state.items.find((i) => i.id === id)!;
    // Por defecto el jugador no ve la vida ni la CA del goblin, pero sí las de su personaje (con los temporales).
    expect(byId(enemy.id).stats ?? null).toBeNull();
    expect(byId(own.id).stats).toMatchObject({ hp: 12, hpMax: 20, hpTemp: 5, ratio: 0.6, tempRatio: 0.25, ac: 16 });

    // Solo la barra: proporción aproximada, sin números.
    got = seen(enemy.id);
    ok(await call(gmC, 'item:update', { sceneId, id: enemy.id, patch: { hpView: 'bar', acView: 'all' } }));
    let item = await got;
    expect(item.stats).toEqual({ ratio: 1, ac: 15 });

    // Al cambiar la hoja (daño), el token llega otra vez con la vida nueva.
    got = seen(enemy.id);
    await app.inject({ method: 'PATCH', url: `/api/characters/${gob.id}`, headers: { cookie: gm.cookie }, payload: { values: { pg_actuales: 3 } } });
    item = await got;
    expect(item.stats).toEqual({ ratio: 0.45, ac: 15 });

    got = seen(enemy.id);
    ok(await call(gmC, 'item:update', { sceneId, id: enemy.id, patch: { hpView: 'numbers', acView: 'gm' } }));
    expect((await got).stats).toEqual({ hp: 3, hpMax: 7, hpTemp: null, ratio: 3 / 7 });
    // El jugador no puede cambiar quién ve la vida de su token.
    expect((await call(plC, 'item:update', { sceneId, id: own.id, patch: { hpView: 'gm' } })).ok).toBe(false);
  });
});

