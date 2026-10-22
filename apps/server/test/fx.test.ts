import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardFx, BoardItem, Character, ChatMessage, ClientToServerEvents, HomebrewEntry, SceneState, ServerToClientEvents } from '@vtt/shared';
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
const settle = () => new Promise((r) => setTimeout(r, 80));
const G = 70;

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'ana');
  const other = await registerUser(app, 'otro');
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'X' })).json();
  for (const u of [pl, other]) await req(u.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
  const sceneId: string = campaign.activeSceneId;

  /** Cliente conectado a la escena que apunta las animaciones que le llegan. */
  const mk = async (cookie: string) => {
    const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    clients.push(c);
    const fx: BoardFx[] = [];
    c.on('board:fx', (p) => fx.push(p.fx));
    ok(await call(c, 'campaign:join', { campaignId: campaign.id }));
    ok(await call<SceneState>(c, 'scene:view', { sceneId }));
    return { c, fx };
  };
  const gmC = await mk(gm.cookie);
  const plC = await mk(pl.cookie);
  const otherC = await mk(other.cookie);

  const newCharacter = async (name: string, values: object, controlledBy: string[] = []) => {
    const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name })).json() as { character: Character };
    await req(gm.cookie, 'PATCH', `/characters/${character.id}`, { controlledBy, values });
    return character;
  };
  const createEntry = async (body: object) => (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/homebrew`, body)).json().entry as HomebrewEntry;
  const token = (item: object) => call<BoardItem>(gmC.c, 'item:create', { sceneId, item: { layer: 'token', width: G, height: G, ...item } }).then(ok);
  const clear = () => [gmC, plC, otherC].forEach((x) => x.fx.splice(0));
  return { gm, pl, req, campaign, sceneId, gmC, plC, otherC, newCharacter, createEntry, token, clear };
}

describe('animaciones de ataques y hechizos en el tablero', () => {
  it('van del token del atacante a los objetivos y cada uno solo ve lo que puede ver', async () => {
    const { pl, sceneId, gmC, plC, otherC, newCharacter, createEntry, token, clear } = await setup();
    const sword = await createEntry({ kind: 'attack', name: 'Espada', data: { attack: 'melee', attackBonus: '5', damage: [{ dice: '1d8', type: 'cortante' }] } });
    const hero = await newCharacter('Brunilda', { ataques: [{ _id: 'a1', nombre: 'Espada', bono: '+5', dano: '1d8 cortante', critico: 20, _ref: sword.id }] }, [pl.user.id]);
    const heroTok = await token({ x: 0, y: 0, characterId: hero.id, ownerIds: [pl.user.id] });
    const goblin = await token({ x: G, y: 0, name: 'Goblin' });
    const hidden = await token({ x: 2 * G, y: 0, name: 'Acechador', layer: 'gm' });
    clear();

    const m = ok(await call<ChatMessage>(plC.c, 'sheet:action', { characterId: hero.id, action: { kind: 'attack', rowId: 'a1' }, fx: { sceneId, targetIds: [goblin.id, hidden.id, heroTok.id] } }));
    await settle();
    const crit = !!m.roll?.crit;
    expect(gmC.fx).toEqual([{ id: expect.any(String), style: 'slash', color: '#e9edf2', crit, from: { x: 35, y: 35 }, to: [{ x: G + 35, y: 35, r: 35 }, { x: 2 * G + 35, y: 35, r: 35 }], area: null }]);
    // Los jugadores no ven el token oculto (ni siquiera que era un objetivo); el atacante no es su propio objetivo.
    for (const p of [plC, otherC]) expect(p.fx).toEqual([{ ...gmC.fx[0], to: [{ x: G + 35, y: 35, r: 35 }] }]);
    clear();

    // Sin pedir animación (macros, sin escena abierta) no se anima.
    ok(await call(plC.c, 'sheet:action', { characterId: hero.id, action: { kind: 'attack', rowId: 'a1' } }));
    // Con plantilla de área y sin objetivos: se anima igual, desde el atacante.
    const area = { shape: 'circle', points: [{ x: 300, y: 300 }, { x: 300, y: 440 }] };
    ok(await call(plC.c, 'sheet:action', { characterId: hero.id, action: { kind: 'attack', rowId: 'a1' }, fx: { sceneId, targetIds: [], area } }));
    await settle();
    expect(otherC.fx).toHaveLength(1);
    expect(otherC.fx[0]).toMatchObject({ from: { x: 35, y: 35 }, to: [], area });
  });

  it('un atacante oculto no revela desde dónde ataca; las tiradas secretas solo las ven el DM y quien tira', async () => {
    const { pl, sceneId, gmC, plC, otherC, newCharacter, createEntry, token, clear } = await setup();
    const bolt = await createEntry({ kind: 'spell', name: 'Rayo de fuego', data: { level: 0, attack: 'ranged', attackBonus: '5', damage: [{ dice: '1d10', type: 'fuego' }] } });
    const mage = await newCharacter('Brujo', { conjuros: [{ _id: 'c1', nivel: 0, nombre: 'Rayo de fuego', efecto: '1d10 fuego', _ref: bolt.id }] });
    await token({ x: 5 * G, y: 0, characterId: mage.id, layer: 'gm' });
    const hero = await newCharacter('Brunilda', { conjuros: [{ _id: 'c1', nivel: 0, nombre: 'Rayo de escarcha', efecto: '1d8 frío' }] }, [pl.user.id]);
    const heroTok = await token({ x: 0, y: 0, characterId: hero.id, ownerIds: [pl.user.id] });
    clear();

    ok(await call(gmC.c, 'sheet:action', { characterId: mage.id, action: { kind: 'cast', rowId: 'c1' }, fx: { sceneId, targetIds: [heroTok.id] } }));
    await settle();
    expect(gmC.fx[0]).toMatchObject({ style: 'bolt', color: '#ff7a1a', from: { x: 5 * G + 35, y: 35 } });
    expect(plC.fx[0]).toMatchObject({ style: 'bolt', from: null, to: [{ x: 35, y: 35, r: 35 }] });
    clear();

    // Fila de la hoja sin creación: se deduce del nombre y del daño. Tirada secreta: el otro jugador no la ve.
    ok(await call(plC.c, 'sheet:action', { characterId: hero.id, action: { kind: 'cast', rowId: 'c1' }, secret: true, fx: { sceneId, targetIds: [] } }));
    await settle();
    expect(plC.fx[0]).toMatchObject({ style: 'bolt', color: '#7fd8ff', from: { x: 35, y: 35 }, to: [] });
    expect(gmC.fx).toHaveLength(1);
    expect(otherC.fx).toHaveLength(0);
  });

  it('un jugador no puede animar en una escena que no es la suya', async () => {
    const { gm, pl, req, campaign, gmC, plC, newCharacter, token, clear } = await setup();
    const hero = await newCharacter('Brunilda', { ataques: [{ _id: 'a1', nombre: 'Hacha', bono: '+5', dano: '1d12 cortante', critico: 20 }] }, [pl.user.id]);
    await token({ x: 0, y: 0, characterId: hero.id, ownerIds: [pl.user.id] });
    const other = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/scenes`, { name: 'Otra' })).json().scene.id as string;
    ok(await call(gmC.c, 'scene:view', { sceneId: other }));
    clear();
    const area = { shape: 'circle', points: [{ x: 0, y: 0 }, { x: 0, y: 100 }] };
    const m = await call(plC.c, 'sheet:action', { characterId: hero.id, action: { kind: 'attack', rowId: 'a1' }, fx: { sceneId: other, targetIds: [], area } });
    expect(m.ok).toBe(true);
    await settle();
    expect(gmC.fx).toHaveLength(0);
  });
});
