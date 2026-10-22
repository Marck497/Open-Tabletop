import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, ChatMessage, ClientToServerEvents, InitiativeState, ServerToClientEvents } from '@vtt/shared';
import { splitRoll } from '../src/modules/chat/service.js';
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
const ok = <T>(r: AckResult<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const tick = () => new Promise((r) => setTimeout(r, 80));

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
    ok(await call(c, 'campaign:join', { campaignId: campaign.id }));
    const inbox: ChatMessage[] = [];
    c.on('chat:message', (m) => inbox.push(m));
    return { c, inbox };
  };
  return { app, gm, ana, bob, campaign, gmC: await mk(gm.cookie), anaC: await mk(ana.cookie), bobC: await mk(bob.cookie) };
}

describe('chat', () => {
  it('separa tirada y etiqueta', () => {
    expect(splitRoll('1d20+5 Ataque con espada')).toEqual({ expression: '1d20+5', label: 'Ataque con espada' });
    expect(splitRoll('2d6 + 3')).toEqual({ expression: '2d6 + 3', label: '' });
    expect(splitRoll('1d20 Sigilo')).toEqual({ expression: '1d20', label: 'Sigilo' });
  });

  it('mensajes, /r, susurros y tiradas secretas llegan solo a quien deben', async () => {
    const { campaign, gmC, anaC, bobC } = await setup();
    const send = (c: Client, text: string) => call<ChatMessage>(c, 'chat:send', { campaignId: campaign.id, text });

    ok(await send(anaC.c, 'Hola a todos'));
    const r = ok(await send(anaC.c, '/r 1d20+5 Ataque'));
    expect(r.kind).toBe('roll');
    expect(r.roll).toMatchObject({ label: 'Ataque', expression: '1d20+5' });
    ok(await send(anaC.c, '/w bob psst, el DM no mira'));
    ok(await send(bobC.c, '/gr 1d20 Perspicacia'));
    ok(await send(bobC.c, '/em se esconde'));
    expect((await send(bobC.c, '/xyz')).ok).toBe(false);
    await tick();

    const texts = (inbox: ChatMessage[]) => inbox.map((m) => m.text || m.roll?.label);
    expect(texts(gmC.inbox)).toEqual(['Hola a todos', 'Ataque', 'Perspicacia', 'se esconde']);
    expect(texts(bobC.inbox)).toEqual(['Hola a todos', 'Ataque', 'psst, el DM no mira', 'Perspicacia', 'se esconde']);
    expect(texts(anaC.inbox)).toEqual(['Hola a todos', 'Ataque', 'psst, el DM no mira', 'se esconde']);
  });

  it('el historial respeta la visibilidad y el DM puede vaciarlo', async () => {
    const { app, gm, ana, campaign, anaC, bobC } = await setup();
    ok(await call(bobC.c, 'chat:send', { campaignId: campaign.id, text: '/gr 1d4' }));
    ok(await call(anaC.c, 'chat:send', { campaignId: campaign.id, text: 'visible' }));
    const hist = (cookie: string) => app.inject({ url: `/api/campaigns/${campaign.id}/chat`, headers: { cookie } }).then((r) => r.json().messages);
    expect((await hist(ana.cookie)).map((m: ChatMessage) => m.text)).toEqual(['visible']);
    expect(await hist(gm.cookie)).toHaveLength(2);
    expect((await app.inject({ method: 'DELETE', url: `/api/campaigns/${campaign.id}/chat`, headers: { cookie: ana.cookie } })).statusCode).toBe(403);
    await app.inject({ method: 'DELETE', url: `/api/campaigns/${campaign.id}/chat`, headers: { cookie: gm.cookie } });
    expect(await hist(gm.cookie)).toHaveLength(0);
  });
});

describe('iniciativa', () => {
  it('el DM gestiona; los jugadores no ven las entradas ocultas', async () => {
    const { campaign, gmC, anaC } = await setup();
    const act = (c: Client, action: object) => call<InitiativeState>(c, 'initiative:action', { campaignId: campaign.id, ...action });
    ok(await act(gmC.c, { type: 'add', entry: { name: 'Orco', value: 12, hidden: true } }));
    ok(await act(gmC.c, { type: 'add', entry: { name: 'Goblin', value: 18 } }));
    const started = ok(await act(gmC.c, { type: 'start' }));
    expect(started.entries.map((e) => e.name)).toEqual(['Goblin', 'Orco']);
    expect((await act(anaC.c, { type: 'add', entry: { name: 'x', value: 1 } })).ok).toBe(false);

    const playerView = ok(await call<InitiativeState>(anaC.c, 'initiative:get', { campaignId: campaign.id }));
    expect(playerView.entries.map((e) => e.name)).toEqual(['Goblin']);
    expect(playerView.turn).toBe(0);

    const next = ok(await act(gmC.c, { type: 'next' }));
    expect(next.turn).toBe(1);
    const hiddenTurn = ok(await call<InitiativeState>(anaC.c, 'initiative:get', { campaignId: campaign.id }));
    expect(hiddenTurn.turn).toBe(-1);
    const wrap = ok(await act(gmC.c, { type: 'next' }));
    expect(wrap).toMatchObject({ turn: 0, round: 2 });
  });

  it('tirar iniciativa desde la hoja añade al personaje y el jugador puede pasar su turno', async () => {
    const { app, gm, ana, campaign, gmC, anaC } = await setup();
    const { character } = (
      await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/characters`, headers: { cookie: gm.cookie }, payload: { name: 'Ana PJ', controlledBy: [ana.user.id] } })
    ).json();
    const updated = new Promise<InitiativeState>((r) => anaC.c.once('initiative:updated', r));
    ok(await call(anaC.c, 'roll', { campaignId: campaign.id, characterId: character.id, expression: '1d20 + @{iniciativa}', label: 'Iniciativa', toInitiative: true }));
    const state = await updated;
    expect(state.entries[0]).toMatchObject({ name: 'Ana PJ', characterId: character.id });

    // Volver a tirar actualiza, no duplica.
    ok(await call(anaC.c, 'roll', { campaignId: campaign.id, characterId: character.id, expression: '50', toInitiative: true }));
    await tick();
    const after = ok(await call<InitiativeState>(gmC.c, 'initiative:get', { campaignId: campaign.id }));
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]!.value).toBe(50);

    ok(await call(gmC.c, 'initiative:action', { campaignId: campaign.id, type: 'add', entry: { name: 'Lobo', value: 1 } }));
    ok(await call(gmC.c, 'initiative:action', { campaignId: campaign.id, type: 'start' }));
    const passed = ok(await call<InitiativeState>(anaC.c, 'initiative:action', { campaignId: campaign.id, type: 'next' }));
    expect(passed.turn).toBe(1);
    // Ya no es su turno: no puede volver a pasarlo.
    expect((await call(anaC.c, 'initiative:action', { campaignId: campaign.id, type: 'next' })).ok).toBe(false);
  });
});

describe('iniciativa automática', () => {
  it('el DM tira a todos con el bono de su hoja; los ocultos van en secreto y todos reciben el aviso', async () => {
    const { app, gm, ana, campaign, gmC, anaC, bobC } = await setup();
    const req = (cookie: string, method: 'POST' | 'PATCH', url: string, payload: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
    const sceneId: string = campaign.activeSceneId;
    // Ana (DES 18 → +4), un ogro (DES 8 → −1), un goblin escondido en la capa del DM y un token sin hoja.
    const { character: hero } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Ana la Pícara', controlledBy: [ana.user.id] })).json();
    await req(gm.cookie, 'PATCH', `/characters/${hero.id}`, { values: { des: 18 } });
    const { character: ogre } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/compendium/ogro`, {})).json();
    const { character: gob } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/compendium/goblin`, {})).json();
    ok(await call(gmC.c, 'scene:view', { sceneId }));
    const add = (item: object) => call(gmC.c, 'item:create', { sceneId, item: { layer: 'token', x: 0, y: 0, width: 70, height: 70, ...item } }).then(ok);
    await add({ characterId: hero.id, ownerIds: [ana.user.id] });
    await add({ characterId: hero.id, ownerIds: [ana.user.id], x: 70 }); // segundo token del mismo personaje: tira una vez
    await add({ characterId: ogre.id, ai: null });
    await add({ characterId: gob.id, layer: 'gm' });
    await add({ name: 'Barril' });
    await add({ drawing: { type: 'text', text: 'Aquí' } });

    // Los jugadores no pueden tirar a todos.
    expect((await call(anaC.c, 'initiative:action', { campaignId: campaign.id, type: 'rollAll', scope: 'all' })).ok).toBe(false);
    const announced = new Promise((r) => bobC.c.once('initiative:announce', r));
    const state = ok(await call<InitiativeState>(gmC.c, 'initiative:action', { campaignId: campaign.id, type: 'rollAll', scope: 'all' }));
    await announced;
    expect(state.entries).toHaveLength(4);
    const byName = Object.fromEntries(state.entries.map((e) => [e.name, e]));
    expect(byName['Ana la Pícara']).toMatchObject({ bonus: 4 });
    expect(byName['Ana la Pícara']!.value).toBe(byName['Ana la Pícara']!.die! + 4);
    expect(byName['Ogro']).toMatchObject({ bonus: -1 });
    expect(byName['Goblin']).toMatchObject({ bonus: 2, hidden: true });
    expect(byName['Barril']).toMatchObject({ bonus: 0 });
    // Ordenado: total y, a igualdad, bono.
    for (let i = 1; i < state.entries.length; i++) {
      const [a, b] = [state.entries[i - 1]!, state.entries[i]!];
      expect(a.value > b.value || (a.value === b.value && a.bonus! >= b.bonus!)).toBe(true);
    }
    await tick();
    // El resumen público no menciona al goblin escondido; el DM recibe además el secreto.
    const pub = bobC.inbox.filter((m) => m.kind === 'system');
    expect(pub).toHaveLength(1);
    expect(pub[0]!.text).toMatch(/Ana la Pícara \d+/);
    expect(pub[0]!.text).not.toMatch(/Goblin/);
    expect(gmC.inbox.filter((m) => m.kind === 'system').map((m) => m.secret)).toEqual([false, true]);

    // Volver a tirar no duplica; "los que faltan" no hay ninguno.
    const again = ok(await call<InitiativeState>(gmC.c, 'initiative:action', { campaignId: campaign.id, type: 'rollAll', scope: 'npcs' }));
    expect(again.entries).toHaveLength(4);
    expect((await call(gmC.c, 'initiative:action', { campaignId: campaign.id, type: 'rollAll', scope: 'missing' })).ok).toBe(false);

    // La jugadora tira la de sus personajes.
    ok(await call(gmC.c, 'initiative:action', { campaignId: campaign.id, type: 'clear' }));
    const mine = ok(await call<InitiativeState>(anaC.c, 'initiative:action', { campaignId: campaign.id, type: 'rollMine' }));
    expect(mine.entries.map((e) => e.name)).toEqual(['Ana la Pícara']);
    expect((await call(bobC.c, 'initiative:action', { campaignId: campaign.id, type: 'rollMine' })).ok).toBe(false);
  });
});

