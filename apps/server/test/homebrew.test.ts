import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, BoardItem, Character, ChatMessage, ClientToServerEvents, HomebrewEntry, SceneState, ServerToClientEvents } from '@vtt/shared';
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

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'ana');
  const other = await registerUser(app, 'otro');
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'X' })).json();
  for (const u of [pl, other]) await req(u.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
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
  const createEntry = async (cookie: string, body: object) => {
    const res = await req(cookie, 'POST', `/campaigns/${campaign.id}/homebrew`, body);
    if (res.statusCode !== 201) throw new Error(res.body);
    return res.json().entry as HomebrewEntry;
  };
  const token = (item: object) => call<BoardItem>(gmC, 'item:create', { sceneId, item: { layer: 'token', width: G, height: G, ...item } }).then(ok);
  return { app, gm, pl, other, req, campaign, gmC, plC, newCharacter, sheet, createEntry, token };
}

describe('creaciones (hechizos, ataques y objetos)', () => {
  it('cada uno ve las suyas y las compartidas; solo el DM comparte y edita las ajenas', async () => {
    const { gm, pl, other, req, campaign, createEntry } = await setup();
    const mine = await createEntry(pl.cookie, { kind: 'attack', name: 'Puño de hierro', data: { attack: 'melee', attackBonus: '5', damage: [{ dice: '1d8', type: 'contundente' }] } });
    expect(mine.data).toMatchObject({ attack: 'melee', critFrom: 20, conditions: [] });
    const list = async (cookie: string) => ((await req(cookie, 'GET', `/campaigns/${campaign.id}/homebrew`)).json().entries as HomebrewEntry[]).map((e) => e.name);
    expect(await list(other.cookie)).toEqual([]);
    expect(await list(gm.cookie)).toEqual(['Puño de hierro']);
    expect((await req(pl.cookie, 'POST', `/campaigns/${campaign.id}/homebrew`, { kind: 'spell', name: 'X', shared: true })).statusCode).toBe(403);
    // Fórmulas mal escritas: se rechazan al guardar.
    const bad = await req(pl.cookie, 'POST', `/campaigns/${campaign.id}/homebrew`, { kind: 'spell', name: 'Roto', data: { damage: [{ dice: '2d6 +', type: 'fuego' }] } });
    expect(bad.statusCode).toBe(400);

    expect((await req(gm.cookie, 'PATCH', `/homebrew/${mine.id}`, { shared: true })).statusCode).toBe(200);
    expect(await list(other.cookie)).toEqual(['Puño de hierro']);
    expect((await req(other.cookie, 'PATCH', `/homebrew/${mine.id}`, { name: 'Mío' })).statusCode).toBe(403);
    expect((await req(other.cookie, 'DELETE', `/homebrew/${mine.id}`)).statusCode).toBe(403);
    expect((await req(pl.cookie, 'DELETE', `/homebrew/${mine.id}`)).statusCode).toBe(200);
    expect(await list(gm.cookie)).toEqual([]);
  });

  it('un hechizo enlazado en la hoja gasta espacio, sube de nivel y deja el efecto listo para aplicar', async () => {
    const { gm, pl, plC, gmC, newCharacter, sheet, createEntry, token } = await setup();
    const fireball = await createEntry(gm.cookie, {
      kind: 'spell',
      name: 'Bola de fuego',
      data: { level: 3, save: 'des', saveDc: '99', saveHalf: true, damage: [{ dice: '8d6', type: 'fuego' }], upcast: '1d6', area: { shape: 'circle', size: 20 }, conditions: ['derribado'], selfStatus: 'concentracion' },
    });
    const mage = await newCharacter(
      'Merlín',
      { espacios_3_max: 1, espacios_4_max: 1, conjuros: [{ _id: 'c1', nivel: 3, nombre: 'Bola de fuego', preparado: true, efecto: '8d6 fuego', notas: '', _ref: fireball.id }] },
      [pl.user.id],
    );
    const mageTok = await token({ x: 0, y: 0, characterId: mage.id, ownerIds: [pl.user.id] });

    const m = ok(await call<ChatMessage>(plC, 'sheet:action', { characterId: mage.id, action: { kind: 'cast', rowId: 'c1' } }));
    expect(m.roll?.label).toBe('Bola de fuego (espacio de nivel 3, quedan 0/1): daño de fuego');
    expect(m.roll?.expression).toBe('8d6');
    expect(m.roll?.effect).toMatchObject({ entryId: fireball.id, save: { ability: 'des', label: 'Destreza', dc: 99, half: true }, area: { shape: 'circle', size: 20 }, conditions: ['derribado'] });
    expect(m.roll!.effect!.damage).toBe(m.roll!.total);
    expect((await sheet(mage.id)).values.espacios_3_usados).toBe(1);
    // Se marca la concentración en su token.
    const state = ok(await call<SceneState>(gmC, 'scene:view', { sceneId: mageTok.sceneId }));
    expect(state.items.find((i) => i.id === mageTok.id)?.statuses).toContain('concentracion');

    // Sin espacios de nivel 3: el siguiente libre (4) suma un dado.
    const up = ok(await call<ChatMessage>(plC, 'sheet:action', { characterId: mage.id, action: { kind: 'cast', rowId: 'c1' } }));
    expect(up.roll?.expression).toBe('9d6');

    // El DM lo aplica a dos tokens: el goblin falla la salvación (CD 99), recibe todo y queda derribado.
    const goblin = await newCharacter('Goblin', { pg_max: 100, pg_actuales: 100, pg_temporales: 5 });
    const gobTok = await token({ x: 3 * G, y: 0, characterId: goblin.id });
    const rock = await token({ x: 4 * G, y: 0, name: 'Roca' });
    expect(await call(plC, 'effect:apply', { messageId: m.id, itemIds: [gobTok.id] })).toMatchObject({ ok: false });
    const applied = ok(await call<ChatMessage>(gmC, 'effect:apply', { messageId: m.id, itemIds: [gobTok.id, rock.id] }));
    const dmg = m.roll!.effect!.damage;
    expect((await sheet(goblin.id)).values).toMatchObject({ pg_temporales: Math.max(0, 5 - dmg), pg_actuales: 100 - Math.max(0, dmg - 5) });
    expect(applied.roll?.label).toBe('Bola de fuego: aplicado a 2 tokens');
    expect(applied.roll?.parts?.[0]?.label).toMatch(/^Goblin: salvación de Destreza \(CD 99\) ✘ falla/);
    expect(applied.text).toContain(`Goblin: ${dmg} de daño, derribado`);
    expect(applied.text).toContain(`Roca: ${dmg} de daño (sin hoja), derribado`);
    const after = ok(await call<SceneState>(gmC, 'scene:view', { sceneId: gobTok.sceneId }));
    expect(after.items.find((i) => i.id === gobTok.id)?.statuses).toEqual(['derribado']);
  });

  it('ataques contra la CA; consumibles y usos se gastan desde la hoja', async () => {
    const { gm, pl, plC, gmC, newCharacter, sheet, createEntry, token } = await setup();
    const sword = await createEntry(gm.cookie, { kind: 'attack', name: 'Espada flamígera', data: { attack: 'melee', attackBonus: '@{fue_mod} + 100', damage: [{ dice: '1d8 + @{fue_mod}', type: 'cortante' }, { dice: '2d6', type: 'fuego' }] } });
    const potion = await createEntry(gm.cookie, { kind: 'item', name: 'Poción de curación', data: { consumable: true, heal: '2d4 + 2' } });
    const breath = await createEntry(gm.cookie, { kind: 'attack', name: 'Aliento', data: { save: 'con', saveDc: '1', saveHalf: false, damage: [{ dice: '10', type: 'veneno' }], uses: 1, recharge: 'corto' } });
    const hero = await newCharacter(
      'Brunilda',
      {
        fue: 16,
        pg_max: 30,
        pg_actuales: 10,
        ataques: [{ _id: 'a1', nombre: 'Espada flamígera', bono: '+103', dano: '1d8 cortante', tipo: '', extra: '', critico: 20, _ref: sword.id }],
        inventario: [{ _id: 'i1', objeto: 'Poción de curación', cantidad: 1, peso: 0.5, _ref: potion.id }],
        recursos: [{ _id: 'r1', nombre: 'Aliento', usos: 1, max: 1, recarga: 'corto', _ref: breath.id }],
      },
      [pl.user.id],
    );

    const hit = ok(await call<ChatMessage>(plC, 'sheet:action', { characterId: hero.id, action: { kind: 'attack', rowId: 'a1' } }));
    expect(hit.roll).toMatchObject({ expression: '1d20 + @{fue_mod} + 100' });
    expect(hit.roll!.parts!.map((p) => p.label.replace(' ×2 dados', ''))).toEqual(['Daño de cortante', 'Daño de fuego']);
    const orc = await newCharacter('Orco', { ca: 13, pg_max: 200, pg_actuales: 200 });
    const orcTok = await token({ x: G, y: 0, characterId: orc.id });
    const applied = ok(await call<ChatMessage>(gmC, 'effect:apply', { messageId: hit.id, itemIds: [orcTok.id] }));
    if (hit.roll!.effect!.attack!.natural !== 1) {
      expect(applied.text).toMatch(/^Orco: (impacta \(CA 13\)|¡crítico!), \d+ de daño/);
      expect((await sheet(orc.id)).values.pg_actuales).toBe(200 - hit.roll!.effect!.damage);
    }

    const drink = ok(await call<ChatMessage>(plC, 'sheet:action', { characterId: hero.id, action: { kind: 'homebrew', entryId: potion.id } }));
    expect(drink.roll?.label).toMatch(/^Poción de curación \(quedan 0\): curación/);
    expect(((await sheet(hero.id)).values.inventario as unknown as { cantidad: number }[])[0]!.cantidad).toBe(0);
    expect(await call(plC, 'sheet:action', { characterId: hero.id, action: { kind: 'homebrew', entryId: potion.id } })).toMatchObject({ ok: false, error: 'No te quedan Poción de curación' });

    const b = ok(await call<ChatMessage>(plC, 'sheet:action', { characterId: hero.id, action: { kind: 'homebrew', entryId: breath.id } }));
    expect(b.roll?.label).toMatch(/^Aliento \(quedan 0\/1 usos\)/);
    expect(b.roll?.effect?.save).toMatchObject({ ability: 'con', dc: 1, half: false });
    expect(await call(plC, 'sheet:action', { characterId: hero.id, action: { kind: 'homebrew', entryId: breath.id } })).toMatchObject({ ok: false, error: 'No te quedan usos de Aliento' });
    // El orco salva siempre (CD 1) y sin "mitad" no recibe nada.
    const saved = ok(await call<ChatMessage>(gmC, 'effect:apply', { messageId: b.id, itemIds: [orcTok.id] }));
    expect(saved.text).toBe('Orco: sin daño');
  });

  it('una creación privada de otro no se puede usar salvo que esté en la hoja', async () => {
    const { pl, other, plC, newCharacter, createEntry } = await setup();
    const secret = await createEntry(other.cookie, { kind: 'spell', name: 'Secreto', data: { level: 0, damage: [{ dice: '1d4', type: 'fuego' }] } });
    const hero = await newCharacter('Ana', {}, [pl.user.id]);
    expect(await call(plC, 'sheet:action', { characterId: hero.id, action: { kind: 'homebrew', entryId: secret.id } })).toMatchObject({ ok: false, error: 'Creación no encontrada' });
  });
});
