import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, Character, ChatMessage, ClientToServerEvents, SceneState, ServerToClientEvents } from '@vtt/shared';
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
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'ana');
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'X' })).json();
  await req(pl.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
  const sceneId: string = campaign.activeSceneId;
  const client = (cookie: string) => {
    const c: Client = connect(server.url, { extraHeaders: { cookie }, transports: ['websocket'], forceNew: true });
    clients.push(c);
    return c;
  };
  const gmC = client(gm.cookie);
  const plC = client(pl.cookie);
  for (const c of [gmC, plC]) {
    ok(await call(c, 'campaign:join', { campaignId: campaign.id }));
    ok(await call<SceneState>(c, 'scene:view', { sceneId }));
  }
  const heard = { gm: [] as ChatMessage[], pl: [] as ChatMessage[] };
  gmC.on('chat:message', (m) => heard.gm.push(m));
  plC.on('chat:message', (m) => heard.pl.push(m));
  const item = (extra: object) => call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer: 'token', x: 0, y: 0, width: 70, height: 70, ...extra } }).then(ok);
  const hero = async () => {
    const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Ana' })).json() as { character: Character };
    await req(gm.cookie, 'PATCH', `/characters/${character.id}`, { controlledBy: [pl.user.id], values: { pg_max: 100, pg_actuales: 100, des: 1 } });
    return character;
  };
  const sheet = async (id: string) => (await req(gm.cookie, 'GET', `/characters/${id}`)).json().character as Character;
  const move = (c: Client, id: string, x: number, y: number, path?: { x: number; y: number }[]) => call<BoardItem>(c, 'item:update', { sceneId, id, patch: { x, y }, path });
  return { gm, pl, campaign, sceneId, gmC, plC, heard, item, hero, sheet, move };
}

const trapAt = (x: number, y: number, trigger: object) => ({
  layer: 'gm',
  x,
  y,
  width: 140,
  height: 140,
  name: 'Foso',
  gmNotes: 'Tres metros de caída',
  drawing: { type: 'zone', text: '🪤', stroke: '#e0533d' },
  trigger: { kind: 'trap', ...trigger },
});

describe('trampas y zonas de aviso', () => {
  it('la trampa salta al pasar por encima: aviso al DM, mensaje a todos, salvación y daño aplicados; luego se desarma', async () => {
    const { pl, sceneId, gmC, plC, heard, item, hero, sheet, move } = await setup();
    const ana = await hero();
    // Salvación imposible (CD 40) para que el daño entre entero.
    const trap = await item(trapAt(280, 0, { message: '¡El suelo cede!', save: 'des', dc: 40, damage: '10', damageType: 'contundente' }));
    expect(trap.trigger).toMatchObject({ kind: 'trap', active: true, once: true });
    // El jugador no recibe ni la zona ni su configuración.
    expect(ok(await call<SceneState>(plC, 'scene:view', { sceneId })).items.find((i) => i.id === trap.id)).toBeUndefined();

    const tok = await item({ name: 'Ana', characterId: ana.id, ownerIds: [pl.user.id] });
    // Cruza la trampa de lado a lado (de la casilla 0 a la 7): entra por el camino aunque acabe fuera.
    ok(await move(plC, tok.id, 490, 0));
    await tick(300);
    const gmText = heard.gm.map((m) => m.text).join('\n');
    expect(gmText).toContain('Ana ha activado «Foso»');
    expect(gmText).toContain('Tres metros de caída');
    // El jugador ve el mensaje y el resultado, pero no el aviso con las notas del DM.
    const plText = heard.pl.map((m) => `${m.roll?.label ?? ''} ${m.text}`).join('\n');
    expect(plText).toContain('¡El suelo cede!');
    expect(plText).not.toContain('Tres metros');
    expect(heard.pl.some((m) => m.roll?.parts?.some((p) => p.label.includes('salvación') && p.label.includes('falla')))).toBe(true);
    expect((await sheet(ana.id)).values.pg_actuales).toBe(90);
    // Desarmada: volver a pasar no hace nada.
    const before = heard.gm.length;
    ok(await move(plC, tok.id, 0, 0));
    ok(await move(plC, tok.id, 490, 0));
    await tick(300);
    expect(heard.gm.length).toBe(before);
    expect(ok(await call<SceneState>(gmC, 'scene:view', { sceneId })).items.find((i) => i.id === trap.id)?.trigger?.active).toBe(false);
  });

  it('una trampa de una vez salta una sola vez aunque la pisen dos tokens a la vez', async () => {
    const { pl, heard, item, move, plC } = await setup();
    await item(trapAt(280, 0, { message: 'Primera' }));
    await item({ ...trapAt(560, 0, { message: 'Segunda' }), name: 'Pozo', height: 420 });
    const a = await item({ name: 'A', ownerIds: [pl.user.id] });
    const b = await item({ name: 'B', x: 420, y: 280, ownerIds: [pl.user.id] });
    // A cruza las dos; B solo la segunda, mientras A todavía está con la primera.
    await Promise.all([move(plC, a.id, 840, 0), move(plC, b.id, 840, 280)]);
    await tick(400);
    expect(heard.gm.filter((m) => m.text.includes('«Pozo»'))).toHaveLength(1);
    expect(heard.gm.filter((m) => m.text === 'Segunda')).toHaveLength(1);
  });

  it('las paredes de los puntos de giro cuentan: rodear la zona no la dispara; moverse dentro tampoco', async () => {
    const { pl, item, heard, move, plC } = await setup();
    await item({ ...trapAt(280, 0, {}), trigger: { kind: 'zone', once: false } });
    const tok = await item({ name: 'Ana', ownerIds: [pl.user.id] });
    // Rodea por abajo (la zona ocupa x 280-420, y 0-140).
    ok(await move(plC, tok.id, 490, 0, [{ x: 35, y: 245 }, { x: 525, y: 245 }]));
    await tick();
    expect(heard.gm.filter((m) => m.text.includes('ha activado'))).toHaveLength(0);
    // Ahora entra.
    ok(await move(plC, tok.id, 280, 0));
    await tick();
    expect(heard.gm.filter((m) => m.text.includes('ha activado'))).toHaveLength(1);
    // Moverse dentro no cuenta; salir y volver a entrar sí (no es de una vez).
    ok(await move(plC, tok.id, 350, 70));
    await tick();
    expect(heard.gm.filter((m) => m.text.includes('ha activado'))).toHaveLength(1);
    ok(await move(plC, tok.id, 560, 0));
    ok(await move(plC, tok.id, 350, 0));
    await tick();
    expect(heard.gm.filter((m) => m.text.includes('ha activado'))).toHaveLength(2);
    // Un aviso no hace daño ni tira nada.
    expect(heard.gm.some((m) => m.roll?.effect)).toBe(false);
  });

  it('por defecto solo la disparan los tokens de jugadores; «cualquier token», también los demás', async () => {
    const { gmC, item, heard, move } = await setup();
    await item({ ...trapAt(280, 0, {}), trigger: { kind: 'zone', once: false } });
    const goblin = await item({ name: 'Goblin' });
    ok(await move(gmC, goblin.id, 280, 0));
    await tick();
    expect(heard.gm.filter((m) => m.text.includes('ha activado'))).toHaveLength(0);
    await item({ ...trapAt(0, 280, {}), name: 'Alarma', trigger: { kind: 'zone', who: 'all' } });
    ok(await move(gmC, goblin.id, 0, 280));
    await tick();
    expect(heard.gm.some((m) => m.text.includes('Goblin ha activado «Alarma»'))).toBe(true);
  });

  it('descubrir: la zona y lo escondido dentro (una emboscada) pasan a la capa de tokens', async () => {
    const { pl, sceneId, plC, item, move } = await setup();
    const zone = await item({ ...trapAt(280, 0, {}), name: 'Emboscada', trigger: { kind: 'zone', reveal: true } });
    const orc = await item({ layer: 'gm', name: 'Orco', x: 350, y: 70 });
    const far = await item({ layer: 'gm', name: 'Lejos', x: 700, y: 700 });
    const tok = await item({ name: 'Ana', ownerIds: [pl.user.id] });
    ok(await move(plC, tok.id, 280, 0));
    await tick(300);
    const seen = ok(await call<SceneState>(plC, 'scene:view', { sceneId })).items;
    expect(seen.find((i) => i.id === orc.id)?.layer).toBe('token');
    expect(seen.find((i) => i.id === far.id)).toBeUndefined();
    // La zona de aviso sigue escondida.
    expect(seen.find((i) => i.id === zone.id)).toBeUndefined();
  });

  it('descubrir una trampa: se ve el foso, sin su configuración ni las notas', async () => {
    const { pl, sceneId, plC, item, move } = await setup();
    const trap = await item(trapAt(280, 0, { reveal: true }));
    const tok = await item({ name: 'Ana', ownerIds: [pl.user.id] });
    ok(await move(plC, tok.id, 280, 0));
    await tick(300);
    const z = ok(await call<SceneState>(plC, 'scene:view', { sceneId })).items.find((i) => i.id === trap.id);
    expect(z).toMatchObject({ layer: 'token', trigger: null, gmNotes: '' });
  });

  it('el jugador no puede crear ni cambiar trampas', async () => {
    const { sceneId, gmC, plC, pl, item } = await setup();
    const r = ok(await call<BoardItem>(plC, 'item:create', { sceneId, item: { ...trapAt(0, 0, {}), layer: 'token' } }));
    expect(r.trigger).toBeNull();
    // Tampoco se guarda (el DM la ve sin trampa).
    expect(ok(await call<SceneState>(gmC, 'scene:view', { sceneId })).items.find((i) => i.id === r.id)?.trigger).toBeNull();
    const tok = await item({ name: 'Ana', ownerIds: [pl.user.id] });
    expect((await call(plC, 'item:update', { sceneId, id: tok.id, patch: { trigger: { kind: 'trap' } } })).ok).toBe(false);
  });
});
