import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, ChatMessage, ServerToClientEvents } from '@vtt/shared';
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
const call = <T>(c: Client, ev: keyof ClientToServerEvents, payload: unknown) =>
  new Promise<AckResult<T>>((r) => (c.emit as (...a: unknown[]) => void)(ev, payload, r));

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'jugador');
  const other = await registerUser(app, 'otro');
  const { campaign } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })).json();
  for (const u of [pl, other])
    await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: u.cookie }, payload: { inviteCode: campaign.inviteCode } });
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  return { app, gm, pl, other, campaign, req };
}

describe('hojas de personaje', () => {
  it('cada partida empieza con la plantilla de D&D 5e', async () => {
    const { pl, campaign, req } = await setup();
    const res = await req(pl.cookie, 'GET', `/campaigns/${campaign.id}/sheet-template`);
    expect(res.json().template.name).toBe('D&D 5e');
  });

  it('solo el DM edita la plantilla, y se valida', async () => {
    const { gm, pl, campaign, req } = await setup();
    const tpl = { name: 'Mío', sections: [{ id: 's', title: 'S', fields: [{ key: 'vida', label: 'Vida', type: 'number' }] }] };
    expect((await req(pl.cookie, 'PUT', `/campaigns/${campaign.id}/sheet-template`, { template: tpl })).statusCode).toBe(403);
    expect((await req(gm.cookie, 'PUT', `/campaigns/${campaign.id}/sheet-template`, { template: { name: '' } })).statusCode).toBe(400);
    const ok = await req(gm.cookie, 'PUT', `/campaigns/${campaign.id}/sheet-template`, { template: tpl });
    expect(ok.json().template.name).toBe('Mío');
    const reset = await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/sheet-template/reset`, { builtinId: 'dnd5e' });
    expect(reset.json().template.name).toBe('D&D 5e');
  });

  it('visibilidad: PNJ ocultos, PJ visibles para su jugador y "visible para todos"', async () => {
    const { gm, pl, other, campaign, req } = await setup();
    const npc = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Villano' })).json().character;
    const pc = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Ana', controlledBy: [pl.user.id] })).json().character;
    expect(pc.values.fue).toBe(10);

    const names = async (cookie: string) =>
      (await req(cookie, 'GET', `/campaigns/${campaign.id}/characters`)).json().characters.map((c: { name: string }) => c.name).sort();
    expect(await names(gm.cookie)).toEqual(['Ana', 'Villano']);
    expect(await names(pl.cookie)).toEqual(['Ana']);
    expect(await names(other.cookie)).toEqual([]);

    await req(gm.cookie, 'PATCH', `/characters/${npc.id}`, { visibleToAll: true });
    expect(await names(other.cookie)).toEqual(['Villano']);
    // Ver no es editar.
    expect((await req(other.cookie, 'PATCH', `/characters/${npc.id}`, { values: { fue: 20 } })).statusCode).toBe(403);
  });

  it('el jugador edita valores de su PJ (fusionando), pero no quién lo controla', async () => {
    const { gm, pl, campaign, req } = await setup();
    const pc = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Ana', controlledBy: [pl.user.id] })).json().character;
    await req(pl.cookie, 'PATCH', `/characters/${pc.id}`, { values: { fue: 16 } });
    const res = await req(pl.cookie, 'PATCH', `/characters/${pc.id}`, { values: { des: 14 } });
    expect(res.json().character.values).toMatchObject({ fue: 16, des: 14, con: 10 });
    expect((await req(pl.cookie, 'PATCH', `/characters/${pc.id}`, { controlledBy: [] })).statusCode).toBe(403);
  });

  it('un jugador puede crear su propio PJ', async () => {
    const { pl, campaign, req } = await setup();
    const res = await req(pl.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Mío', controlledBy: [] });
    expect(res.json().character.controlledBy).toEqual([pl.user.id]);
  });

  it('borrar un personaje desvincula sus tokens', async () => {
    const { gm, campaign, req } = await setup();
    const pc = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'A' })).json().character;
    const c = client(gm.cookie);
    const item = await call<{ id: string }>(c, 'item:create', {
      sceneId: campaign.activeSceneId,
      item: { layer: 'token', x: 0, y: 0, width: 70, height: 70, characterId: pc.id },
    });
    expect(item.ok).toBe(true);
    expect((await req(gm.cookie, 'DELETE', `/characters/${pc.id}`)).statusCode).toBe(200);
  });
});

describe('tiradas', () => {
  it('tira con los valores de la hoja, en el servidor, y lo ven todos', async () => {
    const { gm, pl, campaign, req } = await setup();
    const pc = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Ana', controlledBy: [pl.user.id] })).json().character;
    await req(pl.cookie, 'PATCH', `/characters/${pc.id}`, { values: { fue: 30 } });

    const gmC = client(gm.cookie);
    const plC = client(pl.cookie);
    for (const c of [gmC, plC]) await call(c, 'campaign:join', { campaignId: campaign.id });
    const seen = new Promise<ChatMessage>((r) => gmC.once('chat:message', r));
    const res = await call<ChatMessage>(plC, 'roll', { campaignId: campaign.id, characterId: pc.id, expression: '1d20 + @{fue_mod}', label: 'Fuerza' });
    if (!res.ok) throw new Error(res.error);
    expect(res.data.roll!.total).toBeGreaterThanOrEqual(1 + 10);
    expect(res.data.roll!.total).toBeLessThanOrEqual(20 + 10);
    expect(res.data.characterName).toBe('Ana');
    expect((await seen).id).toBe(res.data.id);
  });

  it('las filas de tabla aportan sus valores', async () => {
    const { gm, campaign, req } = await setup();
    const pc = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'A' })).json().character;
    await req(gm.cookie, 'PATCH', `/characters/${pc.id}`, { values: { ataques: [{ _id: 'r1', nombre: 'Daga', bono: '+100', dano: '1d4' }] } });
    const c = client(gm.cookie);
    const res = await call<ChatMessage>(c, 'roll', { campaignId: campaign.id, characterId: pc.id, row: { listKey: 'ataques', rowId: 'r1' }, expression: '1d20 + @{bono}' });
    if (!res.ok) throw new Error(res.error);
    expect(res.data.roll!.total).toBeGreaterThan(100);
  });

  it('no se puede tirar por el personaje de otro; las secretas solo las ve el DM', async () => {
    const { gm, pl, other, campaign, req } = await setup();
    const pc = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Ana', controlledBy: [pl.user.id], visibleToAll: true })).json().character;
    const oC = client(other.cookie);
    expect((await call(oC, 'roll', { campaignId: campaign.id, characterId: pc.id, expression: '1d20' })).ok).toBe(false);

    const gmC = client(gm.cookie);
    for (const c of [gmC, oC]) await call(c, 'campaign:join', { campaignId: campaign.id });
    const leaked: ChatMessage[] = [];
    oC.on('chat:message', (r) => leaked.push(r));
    const gmSees = new Promise<ChatMessage>((r) => gmC.once('chat:message', r));
    const plC = client(pl.cookie);
    await call(plC, 'campaign:join', { campaignId: campaign.id });
    await call(plC, 'roll', { campaignId: campaign.id, expression: '1d20', secret: true });
    await gmSees;
    await new Promise((r) => setTimeout(r, 80));
    expect(leaked).toHaveLength(0);
  });

  it('rechaza expresiones no válidas', async () => {
    const { gm, campaign } = await setup();
    const c = client(gm.cookie);
    const res = await call(c, 'roll', { campaignId: campaign.id, expression: '1d20 +' });
    expect(res.ok).toBe(false);
  });
});
