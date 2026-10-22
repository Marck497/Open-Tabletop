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
const G = 70;
const tick = () => new Promise((r) => setTimeout(r, 100));

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'ana');
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'X' })).json();
  await req(pl.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
  const sceneId: string = campaign.activeSceneId;

  const mk = async (cookie: string) => {
    const c: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false });
    clients.push(c);
    ok(await call(c, 'campaign:join', { campaignId: campaign.id }));
    ok(await call<SceneState>(c, 'scene:view', { sceneId }));
    return c;
  };
  const gmC = await mk(gm.cookie);
  const plC = await mk(pl.cookie);

  const newCharacter = async (name: string, values: object, controlledBy: string[] = []) => {
    const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name })).json() as { character: Character };
    await req(gm.cookie, 'PATCH', `/characters/${character.id}`, { controlledBy, values });
    return character;
  };
  const sheet = async (id: string) => (await req(gm.cookie, 'GET', `/characters/${id}`)).json().character as Character;
  const token = (item: object) => call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer: 'token', width: G, height: G, ...item } }).then(ok);
  const apply = (c: Client, payload: object) => call<ChatMessage>(c, 'damage:apply', { campaignId: campaign.id, ...payload });
  return { gm, pl, campaign, gmC, plC, newCharacter, sheet, token, apply };
}

describe('daño y curación a mano', () => {
  it('solo el DM; el daño respeta defensas y PG temporales, y la curación no pasa del máximo', async () => {
    const { pl, gmC, plC, newCharacter, sheet, token, apply } = await setup();
    const imp = await newCharacter('Diablillo', { pg_max: 30, pg_actuales: 30, pg_temporales: 3, resistencias: 'fuego' });
    const hero = await newCharacter('Ana', { pg_max: 20, pg_actuales: 10 }, [pl.user.id]);
    const impTok = await token({ x: 0, y: 0, characterId: imp.id });
    const heroTok = await token({ x: G, y: 0, characterId: hero.id });
    const rock = await token({ x: 2 * G, y: 0, name: 'Roca' });

    expect(await apply(plC, { itemIds: [impTok.id], kind: 'damage', amount: '5' })).toMatchObject({ ok: false });

    // 10 de fuego con resistencia = 5: 3 se los comen los temporales y 2 los PG.
    const hit = ok(await apply(gmC, { itemIds: [impTok.id, rock.id], kind: 'damage', amount: '10', type: 'fuego' }));
    expect(hit.roll?.label).toBe('🩸 10 de daño de fuego a 2 tokens');
    expect(hit.text).toContain('Diablillo: 5 de daño (resiste fuego)');
    expect(hit.text).toContain('Roca: 10 de daño (sin hoja)');
    expect((await sheet(imp.id)).values).toMatchObject({ pg_actuales: 28, pg_temporales: 0 });

    const healed = ok(await apply(gmC, { itemIds: [heroTok.id], kind: 'heal', amount: '50' }));
    expect(healed.roll?.label).toBe('💚 Curación de 50 a 1 token');
    expect(healed.text).toBe('Ana: recupera 10 PG (10 → 20)');
    expect((await sheet(hero.id)).values.pg_actuales).toBe(20);
  });

  it('tira los dados en el servidor y rechaza cantidades no válidas', async () => {
    const { gmC, newCharacter, sheet, token, apply } = await setup();
    const orc = await newCharacter('Orco', { pg_max: 100, pg_actuales: 100 });
    const orcTok = await token({ x: 0, y: 0, characterId: orc.id });

    const m = ok(await apply(gmC, { itemIds: [orcTok.id], kind: 'damage', amount: '2d6 + 3' }));
    expect(m.roll?.total).toBeGreaterThanOrEqual(5);
    expect(m.roll?.total).toBeLessThanOrEqual(15);
    expect(m.roll?.rolls.length).toBeGreaterThan(0);
    expect((await sheet(orc.id)).values.pg_actuales).toBe(100 - m.roll!.total);

    expect(await apply(gmC, { itemIds: [orcTok.id], kind: 'damage', amount: '2d6 +' })).toMatchObject({ ok: false });
    expect(await apply(gmC, { itemIds: [orcTok.id], kind: 'damage', amount: '0' })).toMatchObject({ ok: false });
    expect(await apply(gmC, { itemIds: ['no-existe'], kind: 'damage', amount: '3' })).toMatchObject({ ok: false });
  });

  it('avisa a la concentración y oculta a los jugadores el resumen de tokens del DM', async () => {
    const { gmC, plC, newCharacter, token, apply } = await setup();
    const mage = await newCharacter('Mago', { con: 1, pg_max: 500, pg_actuales: 500 });
    const mageTok = await token({ x: 0, y: 0, characterId: mage.id, statuses: ['concentracion'], layer: 'gm' });
    const seen: ChatMessage[] = [];
    plC.on('chat:message', (m) => seen.push(m));
    const gmSaw: ChatMessage[] = [];
    gmC.on('chat:message', (m) => gmSaw.push(m));

    const m = ok(await apply(gmC, { itemIds: [mageTok.id], kind: 'damage', amount: '100' }));
    expect(m.secret).toBe(true);
    await tick();
    expect(gmSaw.some((x) => x.roll?.label.startsWith('🎯 Mago pierde la concentración: salvación de constitución (cd 50) ✘ falla'))).toBe(true);
    expect(seen).toEqual([]);
    const state = ok(await call<SceneState>(gmC, 'scene:view', { sceneId: mageTok.sceneId }));
    expect(state.items.find((i) => i.id === mageTok.id)?.statuses).not.toContain('concentracion');
  });
});
