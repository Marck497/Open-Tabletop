import { afterEach, describe, expect, it } from 'vitest';
import type { BoardItem, Character, Scene } from '@vtt/shared';
import { boardItems } from '../src/db/schema.js';
import { makeApp, registerUser } from './helpers.js';

let built: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => {
  await built?.app.close();
});

async function setup() {
  built = await makeApp();
  const { app } = built;
  const gm = await registerUser(app, 'eldm');
  const pl = await registerUser(app, 'ana');
  const req = (cookie: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url: `/api${url}`, headers: { cookie }, payload });
  const { campaign } = (await req(gm.cookie, 'POST', '/campaigns', { name: 'X' })).json();
  await req(pl.cookie, 'POST', '/campaigns/join', { inviteCode: campaign.inviteCode });
  return { app, gm, pl, campaign, req };
}

describe('asistente de aventura rápida', () => {
  it('crea una escena con mapa, notas, monstruos escondidos con su zona, trampas y tesoro', async () => {
    const { gm, campaign, req } = await setup();
    const res = await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/adventure`, { name: 'La cripta del liche', style: 'dungeon', levels: [3, 3, 3, 3], seed: 7 });
    expect(res.statusCode).toBe(201);
    const { scene, summary } = res.json() as { scene: Scene; summary: { places: number; encounters: number; monsters: number; traps: number } };
    expect(scene).toMatchObject({ name: 'La cripta del liche', widthCells: 40, heightCells: 30, vision: true, exploration: true });
    expect(scene.terrain.length).toBe(40 * 30);
    expect(scene.walls.some((w) => w.kind === 'door')).toBe(true);
    expect(summary.encounters).toBeGreaterThan(0);
    expect(summary.monsters).toBeGreaterThan(0);

    const items = built!.ctx.db.select().from(boardItems).all().filter((i) => i.sceneId === scene.id) as unknown as BoardItem[];
    const notes = items.filter((i) => i.drawing?.type === 'note');
    expect(notes).toHaveLength(summary.places);
    expect(notes.map((n) => Number(n.drawing!.text)).sort((a, b) => a - b)).toEqual(notes.map((_, i) => i + 1));
    expect(notes.every((n) => n.layer === 'gm' && n.gmNotes.length > 0)).toBe(true);
    const monsters = items.filter((i) => i.characterId);
    expect(monsters).toHaveLength(summary.monsters);
    expect(monsters.every((m) => m.layer === 'gm' && m.ai)).toBe(true);
    const zones = items.filter((i) => i.trigger);
    expect(zones.filter((z) => z.trigger!.kind === 'zone' && z.trigger!.reveal)).toHaveLength(summary.encounters);
    expect(zones.filter((z) => z.trigger!.kind === 'trap')).toHaveLength(summary.traps);
    // Cada monstruo queda dentro de la zona de su encuentro (para que aparezca al entrar).
    for (const m of monsters) {
      const c = { x: m.x + m.width / 2, y: m.y + m.height / 2 };
      expect(zones.some((z) => z.trigger!.kind === 'zone' && c.x >= z.x && c.x <= z.x + z.width && c.y >= z.y && c.y <= z.y + z.height), m.name).toBe(true);
    }
    expect(items.some((i) => i.drawing?.text === '🧰')).toBe(true);
    // Los monstruos tienen su hoja en la partida.
    const chars = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/characters`)).json().characters as Character[];
    expect(chars.length).toBeGreaterThanOrEqual(summary.monsters);
  });

  it('solo el DM; datos no válidos dan error sin crear nada', async () => {
    const { pl, gm, campaign, req } = await setup();
    expect((await req(pl.cookie, 'POST', `/campaigns/${campaign.id}/adventure`, { name: 'X', style: 'dungeon', levels: [1] })).statusCode).toBe(403);
    expect((await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/adventure`, { name: 'X', style: 'nope', levels: [1] })).statusCode).toBe(400);
    const scenes = (await req(gm.cookie, 'GET', `/campaigns/${campaign.id}/scenes`)).json().scenes as Scene[];
    expect(scenes).toHaveLength(1);
  });

  it('funciona con todos los estilos y tamaños', async () => {
    const { gm, campaign, req } = await setup();
    for (const [style, size] of [['cave', 'small'], ['forest', 'medium'], ['road', 'small'], ['village', 'large'], ['crypt', 'small']] as const) {
      const res = await req(gm.cookie, 'POST', `/campaigns/${campaign.id}/adventure`, { name: style, style, size, levels: [5, 5, 5], difficulty: 'hard', seed: 3 });
      expect(res.statusCode, `${style}: ${res.body}`).toBe(201);
    }
  });
});
