import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, ClientToServerEvents, ServerToClientEvents } from '@vtt/shared';
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

describe('copias de seguridad', () => {
  it('exporta una partida y la restaura como partida nueva con todo enlazado', async () => {
    server = await listenWithRealtime();
    const { app } = server;
    const gm = await registerUser(app, 'eldm');
    const pl = await registerUser(app, 'jugador');
    const other = await registerUser(app, 'otro');
    const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
    const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'La Mina' })).json();
    await req(pl.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
    const sceneId: string = campaign.activeSceneId;

    // Contenido: imagen, personaje con avatar, token vinculado, paredes, documento, macro y plantilla cambiada.
    const up = multipart(PNG_1x1, 'mapa.png', 'image/png');
    const { asset } = (await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/assets`, payload: up.payload, headers: { ...up.headers, cookie: gm.cookie } })).json();
    const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/compendium/goblin`, {})).json();
    await req(gm.cookie, 'PATCH', `/characters/${character.id}`, { avatarAssetId: asset.id, controlledBy: [pl.user.id] });
    await req(gm.cookie, 'PATCH', `/scenes/${sceneId}`, { name: 'Cueva', vision: true });
    const gmC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: gm.cookie }, reconnection: false });
    clients.push(gmC);
    ok(await call(gmC, 'scene:view', { sceneId }));
    const token = ok(await call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer: 'token', x: 70, y: 70, width: 70, height: 70, characterId: character.id, assetId: asset.id, ownerIds: [pl.user.id] } }));
    ok(await call(gmC, 'walls:set', { sceneId, walls: [{ id: 'w1', x1: 0, y1: 0, x2: 140, y2: 0, kind: 'door', locked: true }] }));
    ok(await call(gmC, 'terrain:set', { sceneId, terrain: 'w'.repeat(600) }));
    await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/handouts`, { title: 'Mapa del tesoro', body: 'Bajo el **roble**', imageAssetId: asset.id, gmNotes: 'Es falso' });
    await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/macros`, { name: 'Ataque', command: '/r 1d20+5', characterId: character.id });
    await req(pl.cookie, 'POST', `/campaigns/${campaign.id}/macros`, { name: 'Privada', command: '/r 1d4' });

    // Solo el DM exporta.
    expect((await req(pl.cookie, 'GET', `/campaigns/${campaign.id}/export`)).statusCode).toBe(403);
    const res = await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/export`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="La-Mina-\d{4}-\d{2}-\d{2}\.vtt\.json\.gz"/);
    const file = res.rawPayload;
    const json = JSON.parse(zlib.gunzipSync(file).toString('utf8'));
    expect(json.macros.map((m: { name: string }) => m.name)).toEqual(['Ataque']);
    expect(json.assets[0].data).toBeTruthy();
    // Sin archivos, la copia no lleva su contenido.
    const light = JSON.parse(zlib.gunzipSync((await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/export?files=0`)).rawPayload).toString('utf8'));
    expect(light.assets[0].data).toBeUndefined();

    // Otro usuario la restaura: queda como DM de una partida nueva.
    const mp = multipart(file, 'copia.vtt.json.gz', 'application/gzip');
    const imp = await app.inject({ method: 'POST', url: '/api/campaigns/import', payload: mp.payload, headers: { ...mp.headers, cookie: other.cookie } });
    expect(imp.statusCode).toBe(201);
    const { summary } = imp.json();
    expect(summary).toMatchObject({ scenes: 1, items: 1, characters: 1, handouts: 1, macros: 1, assets: 1, skippedAssets: 0 });
    expect(summary.campaignId).not.toBe(campaign.id);

    const { scenes, activeSceneId } = (await req(other.cookie, 'GET', `/campaigns/${summary.campaignId}/scenes`)).json();
    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({ name: 'Cueva', vision: true, walls: [{ id: 'w1', kind: 'door', locked: true }], terrain: 'w'.repeat(600) });
    expect(activeSceneId).toBe(scenes[0].id);

    const oC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: other.cookie }, reconnection: false });
    clients.push(oC);
    const state = ok(await call<{ items: BoardItem[] }>(oC, 'scene:view', { sceneId: scenes[0].id }));
    const chars = (await req(other.cookie, 'GET', `/campaigns/${summary.campaignId}/characters`)).json().characters;
    expect(chars).toHaveLength(1);
    expect(chars[0]).toMatchObject({ name: 'Goblin', controlledBy: [], values: { ca: 15 } });
    const [item] = state.items;
    // Todo apunta a los ids nuevos y los jugadores de la partida original no se llevan.
    expect(item).toMatchObject({ x: 70, characterId: chars[0].id, ownerIds: [] });
    expect(item!.id).not.toBe(token.id);
    expect(item!.assetId).toBe(chars[0].avatarAssetId);
    expect(item!.assetId).not.toBe(asset.id);
    expect((await req(other.cookie, 'GET', `/assets/${item!.assetId}`)).rawPayload.equals(PNG_1x1)).toBe(true);
    const hs = (await req(other.cookie, 'GET', `/campaigns/${summary.campaignId}/handouts`)).json().handouts;
    expect(hs[0]).toMatchObject({ title: 'Mapa del tesoro', gmNotes: 'Es falso', imageAssetId: item!.assetId });
    const ms = (await req(other.cookie, 'GET', `/campaigns/${summary.campaignId}/macros`)).json().macros;
    expect(ms[0]).toMatchObject({ name: 'Ataque', characterId: chars[0].id });
  });

  it('rechaza archivos que no son copias', async () => {
    server = await listenWithRealtime();
    const { app } = server;
    const u = await registerUser(app, 'alguien');
    const send = (buf: Buffer) => {
      const mp = multipart(buf, 'x', 'application/octet-stream');
      return app.inject({ method: 'POST', url: '/api/campaigns/import', payload: mp.payload, headers: { ...mp.headers, cookie: u.cookie } });
    };
    expect((await send(Buffer.from('hola'))).statusCode).toBe(400);
    expect((await send(Buffer.from(JSON.stringify({ format: 'otra-cosa' })))).statusCode).toBe(400);
    expect((await send(Buffer.from([0x1f, 0x8b, 1, 2, 3]))).statusCode).toBe(400);
    // Una copia mínima sin escenas: partida nueva con su escena vacía de siempre.
    const res = await send(zlib.gzipSync(JSON.stringify({ format: 'vtt-backup', version: 1, exportedAt: 'x', campaign: { name: 'Vacía' } })));
    expect(res.statusCode).toBe(201);
    const list = (await app.inject({ method: 'GET', url: '/api/campaigns', headers: { cookie: u.cookie } })).json().campaigns;
    expect(list.map((c: { name: string }) => c.name)).toEqual(['Vacía']);
  });
});
