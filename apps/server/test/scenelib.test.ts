import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, ClientToServerEvents, Scene, SceneLibraryEntry, SceneState, ServerToClientEvents } from '@vtt/shared';
import { listenWithRealtime, registerUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: Awaited<ReturnType<typeof listenWithRealtime>>;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.app.close();
});
const call = <T>(c: Client, ev: keyof ClientToServerEvents, payload: unknown) =>
  new Promise<AckResult<T>>((r) => (c.emit as (...a: unknown[]) => void)(ev, payload, r));
function ok<T>(res: AckResult<T>): T {
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
function multipart(buf: Buffer, filename: string, mime: string) {
  const boundary = '----vtt';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Partida con un DM y un jugador, y una escena preparada: imagen de mapa, objeto con luz, enemigo, token del jugador, paredes y suelo. */
async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'jugador');
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const upload = (cookie: string, url: string, buf: Buffer, filename: string, mime: string) => {
    const mp = multipart(buf, filename, mime);
    return app.inject({ method: 'POST', url: `/api${url}`, payload: mp.payload, headers: { ...mp.headers, cookie } });
  };
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'La Mina' })).json();
  await req(pl.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
  const sceneId: string = campaign.activeSceneId;
  await req(gm.cookie, 'PATCH', `/scenes/${sceneId}`, { name: 'Cripta', widthCells: 10, heightCells: 8, vision: true, lighting: true });

  const { asset } = (await upload(gm.cookie, `/campaigns/${campaign.id}/assets`, PNG_1x1, 'mapa.png', 'image/png')).json();
  const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/compendium/goblin`, {})).json();
  const gmC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: gm.cookie }, reconnection: false });
  clients.push(gmC);
  ok(await call(gmC, 'scene:view', { sceneId }));
  const create = (item: object) => call<BoardItem>(gmC, 'item:create', { sceneId, item }).then(ok);
  await create({ layer: 'map', x: 0, y: 0, width: 700, height: 560, assetId: asset.id });
  await create({ layer: 'map', x: 70, y: 70, width: 70, height: 70, drawing: { type: 'stamp', text: '🔥' }, light: { bright: 20, dim: 20 } });
  await create({ layer: 'token', x: 140, y: 140, width: 70, height: 70, name: 'Goblin', characterId: character.id, ai: { enabled: true } });
  await create({ layer: 'token', x: 210, y: 210, width: 70, height: 70, name: 'Ana', ownerIds: [pl.user.id] });
  ok(await call(gmC, 'walls:set', { sceneId, walls: [{ id: 'w1', x1: 0, y1: 0, x2: 140, y2: 0, kind: 'door', locked: true }] }));
  ok(await call(gmC, 'terrain:set', { sceneId, terrain: 'p'.repeat(80) }));
  return { app, gm, pl, req, upload, campaign, sceneId, asset, character, gmC };
}

describe('reutilizar escenas', () => {
  it('duplica una escena justo debajo, en su carpeta, sin los tokens de los jugadores', async () => {
    const { gm, pl, req, campaign, sceneId, character } = await setup();
    const folder = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/scene-folders`, { name: 'Acto 1' })).json().folder;
    await req(gm.cookie, 'PUT', `/campaigns/${campaign.id}/scene-tree`, { scenes: [{ id: sceneId, folderId: folder.id, sortOrder: 0 }] });
    const other = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/scenes`, { name: 'Bosque' })).json().scene as Scene;

    // Solo el DM.
    expect((await req(pl.cookie, 'POST', `/scenes/${sceneId}/duplicate`)).statusCode).toBe(403);
    const res = await req(gm.cookie, 'POST', `/scenes/${sceneId}/duplicate`);
    expect(res.statusCode).toBe(201);
    const copy: Scene = res.json().scene;
    expect(copy).toMatchObject({ name: 'Cripta (copia)', folderId: folder.id, widthCells: 10, heightCells: 8, vision: true, lighting: true, explored: '' });
    expect(copy.walls).toEqual([expect.objectContaining({ id: 'w1', kind: 'door', locked: true })]);
    expect(copy.terrain).toBe('p'.repeat(80));

    // Va justo detrás de la original (antes que la que ya estaba detrás).
    const { scenes } = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/scenes`)).json() as { scenes: Scene[] };
    const order = (id: string) => scenes.find((s) => s.id === id)!.sortOrder;
    expect(order(sceneId)).toBeLessThan(order(copy.id));
    expect(order(copy.id)).toBeLessThan(order(other.id));

    // Los elementos se copian (con ids nuevos), salvo el token del jugador.
    const gmC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: gm.cookie }, reconnection: false });
    clients.push(gmC);
    const original = ok(await call<SceneState>(gmC, 'scene:view', { sceneId }));
    const copied = ok(await call<SceneState>(gmC, 'scene:view', { sceneId: copy.id }));
    expect(original.items).toHaveLength(4);
    expect(copied.items.map((i) => i.name).sort()).toEqual(['', '', 'Goblin']);
    expect(copied.items.some((i) => original.items.some((o) => o.id === i.id))).toBe(false);
    // En la misma partida, el enemigo sigue vinculado a su hoja y el fuego da luz.
    expect(copied.items.find((i) => i.name === 'Goblin')?.characterId).toBe(character.id);
    expect(copied.items.find((i) => i.drawing)?.light).toMatchObject({ bright: 20, dim: 20 });
  });

  it('exporta una escena a un archivo y otro DM la importa en su partida con sus imágenes', async () => {
    const { app, gm, pl, req, upload, sceneId, asset } = await setup();
    expect((await req(pl.cookie, 'GET', `/scenes/${sceneId}/export`)).statusCode).toBe(403);
    const res = await req(gm.cookie, 'GET', `/scenes/${sceneId}/export`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Cripta.vtt-escena.json.gz"');
    const pkg = JSON.parse(zlib.gunzipSync(res.rawPayload).toString('utf8'));
    expect(pkg).toMatchObject({ format: 'vtt-scene', version: 1, scene: { name: 'Cripta', widthCells: 10 } });
    // Nada de los jugadores ni de las hojas de esta partida.
    expect(pkg.items).toHaveLength(3);
    expect(pkg.items.every((i: BoardItem) => i.characterId === null && i.ownerIds.length === 0)).toBe(true);
    expect(pkg.assets).toEqual([expect.objectContaining({ id: asset.id, mime: 'image/png', data: PNG_1x1.toString('base64') })]);

    const other = await registerUser(app, 'otrodm');
    const { campaign: mine } = (await req(other.cookie, 'POST', '/campaigns', { name: 'Otra' })).json();
    // Un jugador no puede importar en una partida ajena.
    expect((await upload(pl.cookie, `/campaigns/${mine.id}/scenes/import`, res.rawPayload, 'Cripta.vtt-escena.json.gz', 'application/gzip')).statusCode).toBe(404);
    const imp = await upload(other.cookie, `/campaigns/${mine.id}/scenes/import`, res.rawPayload, 'Cripta.vtt-escena.json.gz', 'application/gzip');
    expect(imp.statusCode).toBe(201);
    const scene: Scene = imp.json().scene;
    expect(scene).toMatchObject({ campaignId: mine.id, name: 'Cripta', widthCells: 10, terrain: 'p'.repeat(80), folderId: null });
    expect(scene.walls).toHaveLength(1);

    const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: other.cookie }, reconnection: false });
    clients.push(c);
    const state = ok(await call<SceneState>(c, 'scene:view', { sceneId: scene.id }));
    expect(state.items).toHaveLength(3);
    const map = state.items.find((i) => i.assetId);
    // La imagen es un archivo nuevo de la otra partida y se puede descargar.
    expect(map?.assetId).not.toBe(asset.id);
    const file = await app.inject({ method: 'GET', url: `/api/assets/${map!.assetId}`, headers: { cookie: other.cookie } });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(PNG_1x1)).toBe(true);
    expect(state.items.find((i) => i.name === 'Goblin')?.ai).toMatchObject({ enabled: true });
  });

  it('rechaza archivos que no son escenas', async () => {
    const { gm, upload, campaign } = await setup();
    const bad = await upload(gm.cookie, `/campaigns/${campaign.id}/scenes/import`, Buffer.from('hola'), 'x.json', 'application/json');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('No es un archivo de escena');
    const wrong = await upload(gm.cookie, `/campaigns/${campaign.id}/scenes/import`, Buffer.from(JSON.stringify({ format: 'otra-cosa' })), 'x.json', 'application/json');
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toMatch(/^Escena no válida/);
  });

  it('guarda escenas en la biblioteca del DM y las usa en otra de sus partidas', async () => {
    const { app, gm, pl, req, sceneId } = await setup();
    expect((await req(pl.cookie, 'POST', `/scenes/${sceneId}/library`, {})).statusCode).toBe(403);
    const saved = await req(gm.cookie, 'POST', `/scenes/${sceneId}/library`, { name: 'Cripta con fuego' });
    expect(saved.statusCode).toBe(201);
    const entry: SceneLibraryEntry = saved.json().entry;
    expect(entry).toMatchObject({ name: 'Cripta con fuego', widthCells: 10, heightCells: 8, items: 3 });
    expect(entry.size).toBeGreaterThan(0);

    // Cada uno ve solo su biblioteca.
    expect((await req(gm.cookie, 'GET', '/scene-library')).json().entries).toHaveLength(1);
    expect((await req(pl.cookie, 'GET', '/scene-library')).json().entries).toEqual([]);

    // Sigue ahí aunque se borre la escena original.
    await req(gm.cookie, 'DELETE', `/scenes/${sceneId}`);
    const { campaign: second } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'Segunda' })).json();
    const used = await req(gm.cookie, 'POST', `/campaigns/${second.id}/scene-library/${entry.id}`);
    expect(used.statusCode).toBe(201);
    expect(used.json().scene).toMatchObject({ campaignId: second.id, name: 'Cripta con fuego', widthCells: 10, terrain: 'p'.repeat(80) });

    // Otro usuario no puede usarla, renombrarla ni borrarla.
    const other = await registerUser(app, 'otrodm');
    const { campaign: theirs } = (await req(other.cookie, 'POST', '/campaigns', { name: 'Suya' })).json();
    expect((await req(other.cookie, 'POST', `/campaigns/${theirs.id}/scene-library/${entry.id}`)).statusCode).toBe(404);
    expect((await req(other.cookie, 'DELETE', `/scene-library/${entry.id}`)).statusCode).toBe(404);
    // Ni el DM puede meterla en una partida ajena.
    expect((await req(gm.cookie, 'POST', `/campaigns/${theirs.id}/scene-library/${entry.id}`)).statusCode).toBe(404);

    const renamed = await req(gm.cookie, 'PATCH', `/scene-library/${entry.id}`, { name: 'Cripta vieja' });
    expect(renamed.json().entry.name).toBe('Cripta vieja');
    expect((await req(gm.cookie, 'DELETE', `/scene-library/${entry.id}`)).statusCode).toBe(200);
    expect((await req(gm.cookie, 'GET', '/scene-library')).json().entries).toEqual([]);
  });
});
