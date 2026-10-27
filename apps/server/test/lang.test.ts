import { afterEach, describe, expect, it } from 'vitest';
import type { BoardItem, Character, Scene } from '@vtt/shared';
import { boardItems } from '../src/db/schema.js';
import { makeApp, registerUser } from './helpers.js';

let built: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => {
  await built?.app.close();
});

async function setup(lang?: 'es' | 'en') {
  built = await makeApp();
  const { app } = built;
  const gm = await registerUser(app, 'eldm');
  const req = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie: gm.cookie }, payload });
  const { campaign } = (await req('POST', '/campaigns', { name: 'X', ...(lang ? { lang } : {}) })).json();
  return { app, gm, campaign, req };
}

describe('idioma de la partida', () => {
  it('por defecto es español y se puede cambiar sin tocar lo demás', async () => {
    const { campaign, req } = await setup();
    expect(campaign.lang).toBe('es');
    await req('PATCH', `/campaigns/${campaign.id}`, { description: 'Martes', systemId: 'generic' });
    const { campaign: after } = (await req('PATCH', `/campaigns/${campaign.id}`, { lang: 'en' })).json();
    expect(after).toMatchObject({ lang: 'en', description: 'Martes', systemId: 'generic', name: 'X' });
  });

  it('una partida en inglés crea su escena, su aventura y sus monstruos en inglés', async () => {
    const { campaign, req } = await setup('en');
    const scenes = (await req('GET', `/campaigns/${campaign.id}/scenes`)).json().scenes as Scene[];
    expect(scenes[0]?.name).toBe('Scene 1');

    const res = await req('POST', `/campaigns/${campaign.id}/adventure`, { name: 'Test', style: 'dungeon', levels: [3, 3, 3, 3], seed: 7 });
    expect(res.statusCode).toBe(201);
    const scene = res.json().scene as Scene;
    const items = built!.ctx.db.select().from(boardItems).all().filter((i) => i.sceneId === scene.id) as unknown as BoardItem[];
    const notes = items.filter((i) => i.drawing?.type === 'note').map((n) => n.gmNotes).join('\n');
    expect(notes).toMatch(/The adventure starts here/);
    expect(notes).not.toMatch(/Aquí empieza|Encuentro|Trampa:/);

    const goblin = (await req('POST', `/campaigns/${campaign.id}/compendium/goblin`, {})).json().character as Character;
    expect(goblin.name).toBe('Goblin');
    const values = JSON.stringify(goblin.values);
    expect(values).toMatch(/Scimitar|Nimble Escape|Monster \(CR/);
    expect(values).not.toMatch(/Cimitarra|Huida ágil/);
  });

  it('una partida en español sigue escribiéndolo todo en español', async () => {
    const { campaign, req } = await setup('es');
    const scenes = (await req('GET', `/campaigns/${campaign.id}/scenes`)).json().scenes as Scene[];
    expect(scenes[0]?.name).toBe('Escena 1');
    const goblin = (await req('POST', `/campaigns/${campaign.id}/compendium/goblin`, {})).json().character as Character;
    expect(JSON.stringify(goblin.values)).toMatch(/Cimitarra/);
  });
});
