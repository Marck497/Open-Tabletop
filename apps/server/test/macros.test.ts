import { afterEach, describe, expect, it } from 'vitest';
import type { Macro } from '@vtt/shared';
import { makeApp, registerUser } from './helpers.js';

let built: Awaited<ReturnType<typeof makeApp>>;
afterEach(async () => built?.app.close());

describe('macros', () => {
  it('cada uno ve las suyas y las compartidas; solo el DM comparte y edita las compartidas', async () => {
    built = await makeApp();
    const { app } = built;
    const gm = await registerUser(app, 'eldm');
    const ana = await registerUser(app, 'ana');
    const bob = await registerUser(app, 'bob');
    const { campaign } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: gm.cookie }, payload: { name: 'X' } })).json();
    for (const u of [ana, bob])
      await app.inject({ method: 'POST', url: '/api/campaigns/join', headers: { cookie: u.cookie }, payload: { inviteCode: campaign.inviteCode } });
    const req = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
    const list = async (cookie: string) => ((await req(cookie, 'GET', `/campaigns/${campaign.id}/macros`)).json().macros as Macro[]).map((m) => m.name);

    const shared = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/macros`, { name: 'Percepción grupal', command: '/r 1d20 Percepción', shared: true })).json().macro as Macro;
    expect((await req(ana.cookie, 'POST', `/campaigns/${campaign.id}/macros`, { name: 'Ataque', command: '/r 1d20+5 Ataque\n/r 1d8+3 Daño' })).statusCode).toBe(201);
    // Un jugador no puede compartir, ni crear macros vacías o con demasiadas líneas.
    expect((await req(bob.cookie, 'POST', `/campaigns/${campaign.id}/macros`, { name: 'X', command: '/r 1d20', shared: true })).statusCode).toBe(403);
    expect((await req(bob.cookie, 'POST', `/campaigns/${campaign.id}/macros`, { name: 'X', command: '  \n ' })).statusCode).toBe(400);
    expect((await req(bob.cookie, 'POST', `/campaigns/${campaign.id}/macros`, { name: 'X', command: Array(11).fill('hola').join('\n') })).statusCode).toBe(400);

    expect(await list(ana.cookie)).toEqual(['Percepción grupal', 'Ataque']);
    expect(await list(bob.cookie)).toEqual(['Percepción grupal']);
    expect(await list(gm.cookie)).toEqual(['Percepción grupal']);

    // Bob no puede tocar la compartida ni la de Ana.
    expect((await req(bob.cookie, 'PATCH', `/macros/${shared.id}`, { name: 'Hack' })).statusCode).toBe(403);
    const anaMacro = (await req(ana.cookie, 'GET', `/campaigns/${campaign.id}/macros`)).json().macros[1] as Macro;
    expect((await req(bob.cookie, 'DELETE', `/macros/${anaMacro.id}`)).statusCode).toBe(404);

    // Asociar a un personaje: solo a uno que controlas.
    const { character } = (await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/characters`, { name: 'Orco' })).json();
    expect((await req(ana.cookie, 'PATCH', `/macros/${anaMacro.id}`, { characterId: character.id })).statusCode).toBe(404);
    expect((await req(gm.cookie, 'PATCH', `/macros/${shared.id}`, { characterId: character.id })).json().macro.characterId).toBe(character.id);
    expect((await req(gm.cookie, 'DELETE', `/macros/${shared.id}`)).statusCode).toBe(200);
    expect(await list(bob.cookie)).toEqual([]);
  });
});
