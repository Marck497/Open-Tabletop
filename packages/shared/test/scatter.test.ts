import { describe, expect, it } from 'vitest';
import { cellsOf, newScatterStroke, scatterStep, seededRng } from '../src/index.js';

const base = {
  brush: 5,
  size: 1,
  density: 'high' as const,
  emojis: ['🌲', '🌳'],
  allowed: () => true,
};

describe('pincel de objetos', () => {
  it('esparce objetos dentro del pincel, sin repetir casilla', () => {
    const stroke = newScatterStroke();
    const out = scatterStep(stroke, {
      ...base,
      x: 10,
      y: 10,
      rnd: seededRng(1),
    });
    expect(out.length).toBeGreaterThan(3);
    expect(out.length).toBeLessThan(25);
    for (const o of out) {
      expect(Math.abs(o.x - 10)).toBeLessThanOrEqual(2);
      expect(Math.abs(o.y - 10)).toBeLessThanOrEqual(2);
      expect(base.emojis).toContain(o.emoji);
    }
    expect(new Set(out.map((o) => `${o.x},${o.y}`)).size).toBe(out.length);
  });

  it('pasar otra vez por el mismo sitio no añade más', () => {
    const stroke = newScatterStroke();
    const rnd = seededRng(2);
    scatterStep(stroke, { ...base, x: 5, y: 5, rnd });
    expect(scatterStep(stroke, { ...base, x: 5, y: 5, rnd })).toEqual([]);
  });

  it('respeta lo ocupado, lo prohibido y el tamaño de los objetos', () => {
    const occupied = cellsOf(0, 0, 5);
    const stroke = newScatterStroke(occupied);
    expect(scatterStep(stroke, { ...base, x: 2, y: 2, rnd: seededRng(3) })).toEqual([]);

    const none = scatterStep(newScatterStroke(), {
      ...base,
      x: 2,
      y: 2,
      allowed: () => false,
      rnd: seededRng(3),
    });
    expect(none).toEqual([]);

    // Objetos de 2 × 2: ninguno se pisa con otro.
    const big = scatterStep(newScatterStroke(), {
      ...base,
      brush: 8,
      size: 2,
      x: 4,
      y: 4,
      rnd: seededRng(4),
    });
    const cells = big.flatMap((o) => cellsOf(o.x, o.y, 2));
    expect(big.length).toBeGreaterThan(1);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('la cantidad cambia con la densidad', () => {
    const count = (density: 'low' | 'high') => {
      let n = 0;
      for (let s = 0; s < 20; s++)
        n += scatterStep(newScatterStroke(), {
          ...base,
          brush: 8,
          density,
          x: 4,
          y: 4,
          rnd: seededRng(s),
        }).length;
      return n;
    };
    expect(count('high')).toBeGreaterThan(count('low') * 2);
  });
});
