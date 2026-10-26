import { describe, expect, it } from 'vitest';
import { adventureInputSchema, isSolidCell, MAP_STYLES, planAdventure, triggerSchema } from '../src/index.js';

const opts = (extra: object = {}) => ({ ...adventureInputSchema.parse({ name: 'X', style: 'dungeon', levels: [3, 3, 3, 3], ...extra }), seed: 7 });

describe('asistente de aventura rápida', () => {
  it('misma semilla, misma aventura', () => {
    expect(planAdventure(opts())).toEqual(planAdventure(opts()));
  });

  it('cada estilo da sitios numerados en orden, con la entrada primero y el jefe y el tesoro al final', () => {
    for (const style of MAP_STYLES)
      for (const seed of [1, 2, 3]) {
        const plan = planAdventure({ ...opts({ style }), seed });
        const { places } = plan;
        expect(places.length, `${style} ${seed}`).toBeGreaterThanOrEqual(2);
        expect(places.map((p) => p.n)).toEqual(places.map((_, i) => i + 1));
        expect(places[0]!.title).toMatch(/^Entrada/);
        expect(places[0]!.encounter).toBeNull();
        expect(places[0]!.trap).toBeNull();
        const last = places[places.length - 1]!;
        expect(last.treasure, `${style} ${seed}`).not.toBeNull();
        expect(last.text).toContain('Tesoro');
        // Los sitios están dentro del mapa.
        for (const p of places) {
          expect(p.rect.x >= 0 && p.rect.y >= 0 && p.rect.x + p.rect.w <= plan.width && p.rect.y + p.rect.h <= plan.height).toBe(true);
          expect(p.text.length).toBeGreaterThan(5);
          // Lo que se lee a los jugadores (antes de ---) no cuenta los secretos.
          const readable = p.text.split(/^\s*-{3,}\s*$/m)[0]!;
          expect(readable, `${style} ${seed}: ${p.text}`).not.toMatch(/Encuentro|Jefe|Trampa|Tesoro|tokens del grupo/);
        }
      }
  });

  it('encuentros de la dificultad pedida (el último, uno más difícil) y trampas válidas sobre suelo', () => {
    let encounters = 0;
    let traps = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = planAdventure({ ...opts({ difficulty: 'medium' }), seed });
      const t = plan.map.terrain;
      plan.places.forEach((p, i) => {
        if (p.encounter) {
          encounters++;
          expect(p.encounter.monsters.length).toBeGreaterThan(0);
          const expected = i === plan.places.length - 1 ? 'hard' : 'medium';
          expect(p.encounter.difficulty, `semilla ${seed}, sala ${p.n}`).toBe(expected);
          expect(p.text).toContain('PX');
        }
        if (p.trap) {
          traps++;
          expect(p.encounter).toBeNull();
          expect(triggerSchema.safeParse(p.trap.trigger).success).toBe(true);
          expect(isSolidCell(t[p.trap.rect.y * plan.width + p.trap.rect.x])).toBe(false);
          expect(p.trap.trigger).toMatchObject({ dc: 13, damage: '2d10' });
        }
      });
    }
    expect(encounters).toBeGreaterThan(5);
    expect(traps).toBeGreaterThan(2);
  });

  it('sin encuentros ni trampas, solo mapa, notas y tesoro; las trampas suben con el nivel', () => {
    const plan = planAdventure({ ...opts({ encounters: false, traps: false }) });
    expect(plan.places.every((p) => !p.encounter && !p.trap)).toBe(true);
    const high = planAdventure({ ...opts({ levels: [12, 12, 12] }), seed: 3 });
    const trap = high.places.find((p) => p.trap)?.trap;
    expect(trap?.trigger).toMatchObject({ dc: 17, damage: '10d10' });
  });
});
