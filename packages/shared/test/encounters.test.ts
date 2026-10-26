import { describe, expect, it } from 'vitest';
import { encounterMultiplier, MONSTERS, partyThresholds, rateEncounter, suggestEncounter, xpOfCr } from '../src/index.js';

describe('dificultad de los encuentros (5e)', () => {
  it('PX por valor de desafío', () => {
    expect(xpOfCr('0')).toBe(10);
    expect(xpOfCr('1/4')).toBe(50);
    expect(xpOfCr('2')).toBe(450);
    expect(xpOfCr('10')).toBe(5900);
    // Todos los monstruos del compendio tienen PX.
    for (const m of MONSTERS) expect(xpOfCr(m.cr), m.id).toBeGreaterThan(0);
  });

  it('multiplicador según cuántos monstruos y cuántos personajes', () => {
    expect(encounterMultiplier(1, 4)).toBe(1);
    expect(encounterMultiplier(2, 4)).toBe(1.5);
    expect(encounterMultiplier(4, 4)).toBe(2);
    expect(encounterMultiplier(8, 4)).toBe(2.5);
    expect(encounterMultiplier(12, 4)).toBe(3);
    expect(encounterMultiplier(20, 4)).toBe(4);
    // Grupo pequeño: un escalón más; grande: uno menos.
    expect(encounterMultiplier(1, 2)).toBe(1.5);
    expect(encounterMultiplier(20, 2)).toBe(5);
    expect(encounterMultiplier(1, 6)).toBe(0.5);
    expect(encounterMultiplier(0, 4)).toBe(0);
  });

  it('umbrales del grupo: la suma de cada personaje', () => {
    expect(partyThresholds([1, 1, 1, 1])).toEqual({ easy: 100, medium: 200, hard: 300, deadly: 400 });
    expect(partyThresholds([5, 3])).toEqual({ easy: 325, medium: 650, hard: 975, deadly: 1500 });
    // Niveles fuera de rango se ajustan a 1-20.
    expect(partyThresholds([0, 25])).toEqual(partyThresholds([1, 20]));
  });

  it('valora el encuentro', () => {
    const party = [1, 1, 1, 1];
    // 4 goblins: 200 PX × 2 = 400 → mortal para cuatro de nivel 1.
    expect(rateEncounter([{ monsterId: 'goblin', count: 4 }], party)).toMatchObject({ xp: 200, adjustedXp: 400, monsters: 4, multiplier: 2, difficulty: 'deadly' });
    // 2 goblins: 100 × 1,5 = 150 → fácil.
    expect(rateEncounter([{ monsterId: 'goblin', count: 2 }], party).difficulty).toBe('easy');
    // Un orco y un lobo (100 + 50) × 1,5 = 225 → media.
    expect(rateEncounter([{ monsterId: 'orco', count: 1 }, { monsterId: 'lobo', count: 1 }], party)).toMatchObject({ xp: 150, adjustedXp: 225, difficulty: 'medium' });
    // A nivel 5, lo mismo es trivial.
    expect(rateEncounter([{ monsterId: 'goblin', count: 4 }], [5, 5, 5, 5]).difficulty).toBe('trivial');
    // Monstruos desconocidos no cuentan; sin grupo, trivial.
    expect(rateEncounter([{ monsterId: 'no-existe', count: 3 }], party)).toMatchObject({ xp: 0, monsters: 0 });
    expect(rateEncounter([{ monsterId: 'goblin', count: 4 }], []).difficulty).toBe('trivial');
  });
});

describe('sugerir encuentros', () => {
  /** Números al azar con semilla, para que el test sea siempre igual. */
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it('propone monstruos que caen en la dificultad pedida', () => {
    for (const levels of [[1, 1, 1, 1], [3, 3, 4], [5, 5, 5, 5, 5], [8, 8], [12, 12, 12, 12]]) {
      for (const d of ['easy', 'medium', 'hard', 'deadly'] as const) {
        for (let seed = 1; seed <= 20; seed++) {
          const list = suggestEncounter(levels, d, seeded(seed));
          expect(list.length, `${levels} ${d} ${seed}`).toBeGreaterThan(0);
          expect(rateEncounter(list, levels).difficulty, `${levels} ${d} ${seed}: ${JSON.stringify(list)}`).toBe(d);
        }
      }
    }
  });

  it('sin grupo no propone nada', () => {
    expect(suggestEncounter([], 'medium')).toEqual([]);
  });
});
