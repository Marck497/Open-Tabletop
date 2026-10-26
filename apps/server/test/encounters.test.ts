import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, Character, ClientToServerEvents, Encounter, SceneState, ServerToClientEvents } from '@vtt/shared';
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
const tick = () => new Promise((r) => setTimeout(r, 100));

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'jugador');
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'La Mina' })).json();
  await req(pl.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
  const sceneId: string = campaign.activeSceneId;
  const client = (cookie: string) => {
    const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    clients.push(c);
    return c;
  };
  return { app, gm, pl, req, campaign, sceneId, client };
}

describe('encuentros preparados', () => {
  it('el DM los guarda, cambia y borra; los jugadores no los ven', async () => {
    const { app, gm, pl, req, campaign } = await setup();
    const res = await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/encounters`, {
      name: 'Emboscada goblin',
      notes: 'Desde los arbustos',
      monsters: [{ monsterId: 'goblin', count: 4 }],
    });
    expect(res.statusCode).toBe(201);
    const enc: Encounter = res.json().encounter;
    expect(enc).toMatchObject({ name: 'Emboscada goblin', notes: 'Desde los arbustos', monsters: [{ monsterId: 'goblin', count: 4 }] });

    expect((await req(pl.cookie, 'GET', `/campaigns/${campaign.id}/encounters`)).statusCode).toBe(403);
    expect((await req(pl.cookie, 'POST', `/campaigns/${campaign.id}/encounters`, { name: 'x' })).statusCode).toBe(403);
    expect((await req(pl.cookie, 'PATCH', `/encounters/${enc.id}`, { name: 'x' })).statusCode).toBe(403);
    const stranger = await registerUser(app, 'ajeno');
    expect((await req(stranger.cookie, 'DELETE', `/encounters/${enc.id}`)).statusCode).toBe(404);

    // Validaciones: monstruos que existen y no más de 40.
    expect((await req(gm.cookie, 'PATCH', `/encounters/${enc.id}`, { monsters: [{ monsterId: 'dragon-azul', count: 1 }] })).statusCode).toBe(400);
    expect((await req(gm.cookie, 'PATCH', `/encounters/${enc.id}`, { monsters: [{ monsterId: 'goblin', count: 30 }, { monsterId: 'orco', count: 11 }] })).statusCode).toBe(400);

    const upd = await req(gm.cookie, 'PATCH', `/encounters/${enc.id}`, { name: 'Emboscada', monsters: [{ monsterId: 'goblin', count: 2 }, { monsterId: 'lobo', count: 1 }] });
    expect(upd.json().encounter).toMatchObject({ name: 'Emboscada', notes: 'Desde los arbustos', monsters: [{ monsterId: 'goblin', count: 2 }, { monsterId: 'lobo', count: 1 }] });
    expect((await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/encounters`)).json().encounters).toHaveLength(1);
    expect((await req(gm.cookie, 'DELETE', `/encounters/${enc.id}`)).statusCode).toBe(200);
    expect((await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/encounters`)).json().encounters).toEqual([]);
  });

  it('suelta el encuentro: hojas numeradas y tokens con IA en casillas libres, sin cruzar paredes', async () => {
    const { gm, pl, req, campaign, sceneId, client } = await setup();
    await req(gm.cookie, 'PATCH', `/scenes/${sceneId}`, { widthCells: 10, heightCells: 6 });
    const gmC = client(gm.cookie);
    const plC = client(pl.cookie);
    ok(await call(gmC, 'scene:view', { sceneId }));
    ok(await call(plC, 'scene:view', { sceneId }));
    // Suelo solo en las columnas 0-5 (el resto es vacío) y una pared en x=3 de arriba abajo.
    const row = 'pppppp....';
    ok(await call(gmC, 'terrain:set', { sceneId, terrain: row.repeat(6) }));
    ok(await call(gmC, 'walls:set', { sceneId, walls: [{ id: 'w', x1: 210, y1: 0, x2: 210, y2: 420, kind: 'wall' }] }));
    // Un token ya ocupa la casilla del centro.
    ok(await call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer: 'token', x: 70, y: 140, width: 70, height: 70, name: 'Ana', ownerIds: [pl.user.id] } }));

    const enc: Encounter = (
      await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/encounters`, {
        name: 'Patrulla',
        monsters: [
          { monsterId: 'goblin', count: 2 },
          { monsterId: 'lobo', count: 1 },
          { monsterId: 'goblin', count: 1 },
        ],
      })
    ).json().encounter;

    const seen: BoardItem[] = [];
    plC.on('item:upserted', ({ item }) => seen.push(item));
    expect((await req(pl.cookie, 'POST', `/encounters/${enc.id}/deploy`, { sceneId, x: 175, y: 175 })).statusCode).toBe(403);
    const res = await req(gm.cookie, 'POST', `/encounters/${enc.id}/deploy`, { sceneId, x: 175, y: 175 });
    expect(res.statusCode).toBe(201);
    expect(res.json().characters).toBe(4);

    const state = ok(await call<SceneState>(gmC, 'scene:view', { sceneId }));
    const monsters = state.items.filter((i) => i.characterId);
    expect(monsters.map((i) => i.name).sort()).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3', 'Lobo']);
    for (const m of monsters) {
      expect(m).toMatchObject({ layer: 'token', showName: true, width: 70, height: 70 });
      expect(m.ai?.enabled).toBe(true);
      const cx = m.x / 70;
      const cy = m.y / 70;
      // En el suelo, al mismo lado de la pared que el centro, y sin pisar a Ana.
      expect(cx).toBeLessThan(3);
      expect(cx === 1 && cy === 2).toBe(false);
    }
    // Sin repetir casilla.
    expect(new Set(monsters.map((m) => `${m.x},${m.y}`)).size).toBe(4);
    // Las hojas existen con su vida.
    const { characters } = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/characters`)).json() as { characters: Character[] };
    expect(characters.filter((c) => c.name.startsWith('Goblin'))).toHaveLength(3);
    // El jugador ve llegar los tokens (pueden llegar repetidos al avisar también de la hoja nueva).
    await tick();
    expect(new Set(seen.filter((i) => i.characterId).map((i) => i.id)).size).toBe(4);
  });

  it('escondidos van a la capa del DM; si no caben, no se crea nada', async () => {
    const { gm, pl, req, campaign, sceneId, client } = await setup();
    await req(gm.cookie, 'PATCH', `/scenes/${sceneId}`, { widthCells: 3, heightCells: 2 });
    const plC = client(pl.cookie);
    ok(await call(plC, 'scene:view', { sceneId }));
    const seen: BoardItem[] = [];
    plC.on('item:upserted', ({ item }) => seen.push(item));

    const ambush: Encounter = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/encounters`, { name: 'Escondidos', monsters: [{ monsterId: 'goblin', count: 2 }] })).json().encounter;
    expect((await req(gm.cookie, 'POST', `/encounters/${ambush.id}/deploy`, { sceneId, x: 0, y: 0, hidden: true })).statusCode).toBe(201);
    const gmC = client(gm.cookie);
    const state = ok(await call<SceneState>(gmC, 'scene:view', { sceneId }));
    expect(state.items.filter((i) => i.characterId).every((i) => i.layer === 'gm')).toBe(true);
    await tick();
    expect(seen).toEqual([]);

    // Un ogro (2×2) y tres goblins no caben en lo que queda: error y ninguna hoja nueva.
    const big: Encounter = (
      await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/encounters`, { name: 'Grande', monsters: [{ monsterId: 'ogro', count: 1 }, { monsterId: 'goblin', count: 3 }] })
    ).json().encounter;
    const before = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/characters`)).json().characters.length;
    const res = await req(gm.cookie, 'POST', `/encounters/${big.id}/deploy`, { sceneId, x: 0, y: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/No queda sitio/);
    expect((await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/characters`)).json().characters.length).toBe(before);
  });

  it('van en la copia de seguridad de la partida', async () => {
    const { gm, req, campaign } = await setup();
    await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/encounters`, { name: 'Jefe', notes: 'Al fondo', monsters: [{ monsterId: 'ogro', count: 1 }] });
    const file = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/export?files=0`)).rawPayload;
    expect(JSON.parse(zlib.gunzipSync(file).toString('utf8')).encounters).toEqual([expect.objectContaining({ name: 'Jefe', notes: 'Al fondo' })]);
    const boundary = '----vtt';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="c.vtt.json.gz"\r\nContent-Type: application/gzip\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const imp = await server.app.inject({ method: 'POST', url: '/api/campaigns/import', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie: gm.cookie } });
    expect(imp.json().summary.encounters).toBe(1);
    const list = (await req(gm.cookie, 'GET', `/campaigns/${imp.json().summary.campaignId}/encounters`)).json().encounters;
    expect(list).toEqual([expect.objectContaining({ name: 'Jefe', monsters: [{ monsterId: 'ogro', count: 1 }] })]);
  });
});
