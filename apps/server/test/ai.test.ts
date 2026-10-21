import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, AiTurnResult, BoardItem, Character, ChatMessage, ClientToServerEvents, InitiativeState, SceneState, ServerToClientEvents } from '@vtt/shared';
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const G = 70;

async function setup(orcLayer: 'token' | 'gm' = 'token') {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'ana');
  const { campaign } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })).json();
  await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: pl.cookie }, payload: { inviteCode: campaign.inviteCode } });
  const sceneId: string = campaign.activeSceneId;

  const mk = async (cookie: string) => {
    const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    clients.push(c);
    ok(await call(c, 'campaign:join', { campaignId: campaign.id }));
    ok(await call<SceneState>(c, 'scene:view', { sceneId }));
    const inbox: ChatMessage[] = [];
    c.on('chat:message', (m) => inbox.push(m));
    return { c, inbox };
  };
  const gmC = await mk(gm.cookie);
  const plC = await mk(pl.cookie);

  // Ana (PJ de la jugadora, 10 PG, CA 12) a 5 casillas del orco.
  const { character: ana } = (
    await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/characters`, headers: { cookie: gm.cookie }, payload: { name: 'Ana', controlledBy: [pl.user.id] } })
  ).json() as { character: Character };
  await app.inject({ method: 'PATCH', url: `/api/characters/${ana.id}`, headers: { cookie: gm.cookie }, payload: { values: { ca: 12 } } });
  const create = (item: object) => call<BoardItem>(gmC.c, 'item:create', { sceneId, item: { width: G, height: G, ...item } }).then(ok);
  const anaTok = await create({ layer: 'token', x: 5 * G, y: 0, characterId: ana.id });
  const orc = await create({
    layer: orcLayer,
    x: 0,
    y: 0,
    name: 'Orco',
    ai: { behavior: 'melee', attackName: 'Hacha', attack: '100', damage: '4' },
  });

  const init = (action: object) => call<InitiativeState>(gmC.c, 'initiative:action', { campaignId: campaign.id, ...action }).then(ok);
  await init({ type: 'add', entry: { name: 'Orco', value: 20, itemId: orc.id, hidden: orcLayer === 'gm' } });
  await init({ type: 'add', entry: { name: 'Ana', value: 5, itemId: anaTok.id, characterId: ana.id } });
  return { app, gm, pl, campaign, sceneId, gmC, plC, ana, orc, anaTok, init };
}

describe('IA de enemigos', () => {
  it('el DM hace actuar al orco: se acerca, ataca y resta los PG', async () => {
    const { campaign, gmC, plC, orc, init } = await setup();
    await init({ type: 'start' });
    const moves: { x: number }[] = [];
    plC.c.on('item:moving', (m) => moves.push(m));
    const updated = new Promise<Character>((r) => plC.c.on('character:upserted', ({ character }) => r(character)));

    const res = ok(await call<AiTurnResult>(gmC.c, 'ai:act', { campaignId: campaign.id }));
    expect(res).toMatchObject({ itemId: orc.id, moved: 4, attacked: true, hit: true, damage: 4 });
    expect(moves.length).toBe(3); // anima casilla a casilla
    expect((await updated).values.pg_actuales).toBe(6);

    const state = ok(await call<SceneState>(gmC.c, 'scene:view', { sceneId: campaign.activeSceneId }));
    expect(state.items.find((i) => i.id === orc.id)).toMatchObject({ x: 4 * 70, y: 0 });

    await sleep(50);
    const texts = plC.inbox.map((m) => m.roll?.label ?? m.text);
    expect(texts[0]).toContain('carga contra Ana');
    expect(texts[1]).toBe('Hacha → Ana (CA 12): impacta');
    expect(texts[2]).toBe('Daño a Ana (10 → 6)');
    // La jugadora no ve la configuración de IA del orco.
    const plState = ok(await call<SceneState>(plC.c, 'scene:view', { sceneId: campaign.activeSceneId }));
    expect(plState.items.find((i) => i.id === orc.id)?.ai).toBeNull();
    // Y no puede hacer actuar a nadie.
    expect((await call(plC.c, 'ai:act', { campaignId: campaign.id })).ok).toBe(false);
  });

  it('sin ataque propio usa la tabla de ataques de su hoja (plantilla 5e)', async () => {
    const { app, gm, campaign, gmC, plC, orc, init } = await setup();
    const { character: npc } = (
      await app.inject({ method: 'POST', url: `/api/campaigns/${campaign.id}/characters`, headers: { cookie: gm.cookie }, payload: { name: 'Orco' } })
    ).json() as { character: Character };
    await app.inject({
      method: 'PATCH',
      url: `/api/characters/${npc.id}`,
      headers: { cookie: gm.cookie },
      payload: { values: { velocidad: 20, ataques: [{ _id: 'a1', nombre: 'Cimitarra', bono: '+100', dano: '3' }] } },
    });
    ok(await call(gmC.c, 'item:update', { sceneId: campaign.activeSceneId, id: orc.id, patch: { characterId: npc.id, ai: { behavior: 'melee' } } }));
    await init({ type: 'start' });
    const res = ok(await call<AiTurnResult>(gmC.c, 'ai:act', { campaignId: campaign.id }));
    expect(res).toMatchObject({ moved: 4, attacked: true });
    await sleep(50);
    const labels = plC.inbox.map((m) => m.roll?.label ?? m.text);
    expect(labels[0]).toContain('(se mueve 20 pies)');
    expect(labels[1]).toMatch(/^Cimitarra → Ana \(CA 12\)/);
  });

  it('modo automático: al empezar el combate el orco juega y pasa el turno a Ana', async () => {
    const { plC, init } = await setup();
    await init({ type: 'aiSettings', settings: { auto: true, applyDamage: false } });
    const turnOfAna = new Promise<InitiativeState>((r) =>
      plC.c.on('initiative:updated', (s) => s.active && s.entries[s.turn]?.name === 'Ana' && r(s)),
    );
    await init({ type: 'start' });
    const s = await turnOfAna;
    expect(s.round).toBe(1);
    expect(plC.inbox.some((m) => m.roll?.label.startsWith('Daño a Ana') && !m.roll.label.includes('→'))).toBe(true);
  });

  it('aturdido pierde el turno; un objetivo sin hoja marcado como muerto se ignora', async () => {
    const { campaign, sceneId, gmC, orc, init } = await setup();
    await init({ type: 'start' });
    ok(await call(gmC.c, 'item:update', { sceneId, id: orc.id, patch: { statuses: ['aturdido'] } }));
    const stunned = ok(await call<AiTurnResult>(gmC.c, 'ai:act', { campaignId: campaign.id }));
    expect(stunned).toMatchObject({ moved: 0, attacked: false, summary: 'no puede actuar (aturdido)' });

    ok(await call(gmC.c, 'item:update', { sceneId, id: orc.id, patch: { statuses: [] } }));
    const corpse = ok(await call<BoardItem>(gmC.c, 'item:create', { sceneId, item: { layer: 'token', x: G, y: G, width: G, height: G, name: 'Cadáver', ownerIds: ['x'], statuses: ['muerto'] } }));
    const res = ok(await call<AiTurnResult>(gmC.c, 'ai:act', { campaignId: campaign.id }));
    expect(res.summary).toContain('Ana');
    expect(corpse).toBeTruthy();
  });

  it('un enemigo escondido (capa DM) actúa en secreto', async () => {
    const { campaign, gmC, plC, init } = await setup('gm');
    await init({ type: 'start' });
    ok(await call<AiTurnResult>(gmC.c, 'ai:act', { campaignId: campaign.id }));
    await sleep(80);
    expect(gmC.inbox.length).toBe(3);
    expect(plC.inbox.length).toBe(0);
  });
});
