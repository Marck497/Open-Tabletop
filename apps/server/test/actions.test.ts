import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AckResult, Character, ChatMessage, ClientToServerEvents, ServerToClientEvents } from '@vtt/shared';
import { listenWithRealtime, registerUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let server: Awaited<ReturnType<typeof listenWithRealtime>>;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.app.close();
});

const act = (c: Client, payload: unknown) => new Promise<AckResult<ChatMessage>>((r) => (c.emit as (...a: unknown[]) => void)('sheet:action', payload, r));
const ok = <T>(res: AckResult<T>): T => {
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

async function setup() {
  server = await listenWithRealtime();
  const { app } = server;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'jugador');
  const other = await registerUser(app, 'otro');
  const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'X' })).json();
  for (const u of [pl, other]) await req(u.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
  const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Brunilda' })).json();
  await req(gm.cookie, 'PATCH', `/characters/${character.id}`, {
    controlledBy: [pl.user.id],
    values: {
      fue: 16,
      pg_max: 30,
      pg_actuales: 12,
      espacios_1_max: 2,
      espacios_1_usados: 1,
      ataques: [
        { _id: 'a1', nombre: 'Hacha', bono: '+5', dano: '1d12 + @{fue_mod} cortante', tipo: 'cortante', extra: '1d6 fuego', critico: 2 },
        { _id: 'a2', nombre: 'Rayo de escarcha', bono: 'CD 13 CON', dano: '1d8 frío', tipo: '', extra: '', critico: 20 },
      ],
      conjuros: [
        { _id: 'c1', nivel: 1, nombre: 'Curar heridas', preparado: true, efecto: '1d8 + 3', notas: '' },
        { _id: 'c2', nivel: 0, nombre: 'Luz', preparado: true, efecto: '', notas: '' },
      ],
      recursos: [{ _id: 'r1', nombre: 'Furia', usos: 1, max: 2, recarga: 'largo' }],
    },
  });
  const plC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: pl.cookie }, reconnection: false });
  const otherC: Client = connect(server.url, { transports: ['websocket'], extraHeaders: { cookie: other.cookie }, reconnection: false });
  clients.push(plC, otherC);
  const sheet = async () => (await req(gm.cookie, 'GET', `/characters/${character.id}`)).json().character as Character;
  return { campaign, character, plC, otherC, sheet };
}

describe('botones de acción de la hoja', () => {
  it('ataque: tirada, daño y daño extra; con "crítico con 2" es crítico salvo con un 1 natural y dobla los dados', async () => {
    const { character, plC } = await setup();
    // Un 1 natural nunca es crítico (pifia): se repite hasta que no salga (1 de cada 20 veces).
    let m = ok(await act(plC, { characterId: character.id, action: { kind: 'attack', rowId: 'a1' } }));
    for (let i = 0; i < 10 && m.roll?.label.endsWith('pifia'); i++) {
      expect(m.roll.crit).toBe(false);
      m = ok(await act(plC, { characterId: character.id, action: { kind: 'attack', rowId: 'a1' } }));
    }
    expect(m.kind).toBe('roll');
    expect(m.roll).toMatchObject({ label: expect.stringMatching(/^Hacha/), expression: '1d20 + @{bono}', crit: true });
    const [dmg, extra] = m.roll!.parts!;
    expect(dmg!.label).toBe('Daño (cortante) ×2 dados');
    expect(dmg!.rolls.filter((r) => r.sides === 12)).toHaveLength(2);
    expect(dmg!.total).toBeGreaterThanOrEqual(2 + 3);
    expect(extra!.label).toBe('Extra (fuego)');
    expect(extra!.rolls.filter((r) => r.sides === 6)).toHaveLength(2);
    // Un "bono" que no es una tirada (CD de un truco): solo se tira el daño.
    const cantrip = ok(await act(plC, { characterId: character.id, action: { kind: 'attack', rowId: 'a2' } }));
    expect(cantrip.roll).toMatchObject({ label: 'Rayo de escarcha (CD 13 CON): daño (frío)', expression: '1d8' });
  });

  it('conjuros gastan espacios; los trucos no', async () => {
    const { character, plC, sheet } = await setup();
    const cure = ok(await act(plC, { characterId: character.id, action: { kind: 'cast', rowId: 'c1' } }));
    expect(cure.roll?.label).toBe('Curar heridas (espacio de nivel 1, quedan 0/2)');
    expect((await sheet()).values.espacios_1_usados).toBe(2);
    const again = await act(plC, { characterId: character.id, action: { kind: 'cast', rowId: 'c1' } });
    expect(again).toMatchObject({ ok: false, error: expect.stringContaining('No te quedan espacios') });
    const light = ok(await act(plC, { characterId: character.id, action: { kind: 'cast', rowId: 'c2' } }));
    expect(light).toMatchObject({ kind: 'emote', text: 'lanza Luz (truco).' });
  });

  it('usos y descansos', async () => {
    const { character, plC, sheet } = await setup();
    const used = ok(await act(plC, { characterId: character.id, action: { kind: 'use', rowId: 'r1' } }));
    expect(used.text).toBe('usa Furia (quedan 0/2).');
    expect((await act(plC, { characterId: character.id, action: { kind: 'use', rowId: 'r1' } })).ok).toBe(false);
    const rest = ok(await act(plC, { characterId: character.id, action: { kind: 'rest', rest: 'long' } }));
    expect(rest.text).toBe('hace un descanso largo y recupera los PG, los espacios de conjuro y Furia.');
    const v = (await sheet()).values;
    expect(v).toMatchObject({ pg_actuales: 30, espacios_1_usados: 0 });
    expect((v.recursos as unknown as { usos: number }[])[0]!.usos).toBe(2);
  });

  it('solo quien controla la hoja (o el DM) puede usarla', async () => {
    const { character, otherC } = await setup();
    expect(await act(otherC, { characterId: character.id, action: { kind: 'rest', rest: 'short' } })).toMatchObject({ ok: false });
  });
});
