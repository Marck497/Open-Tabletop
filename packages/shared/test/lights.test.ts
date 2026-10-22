import { describe, expect, it } from 'vitest';
import { decodeExplored, exploredGrid, exploreFrom, eyeOf, isExplored, lightsOf, lightsSeenBy, seesRect, type Wall } from '../src/index.js';

const scale = { gridSize: 70, cellDistance: 5 };
const wall: Wall = { id: 'w', x1: 350, y1: -700, x2: 350, y2: 1400, kind: 'wall', open: false, locked: false };

describe('luces y visión en la oscuridad', () => {
  it('pasa las distancias a píxeles y salta los elementos sin luz', () => {
    const lights = lightsOf(
      [
        { x: 0, y: 0, width: 70, height: 70, light: { bright: 20, dim: 20, color: '#fff' } },
        { x: 0, y: 0, width: 70, height: 70, light: null },
        { x: 0, y: 0, width: 70, height: 70, light: { bright: 0, dim: 0, color: '#fff' } },
      ],
      scale,
    );
    expect(lights).toEqual([{ x: 35, y: 35, bright: 280, radius: 560, color: '#fff' }]);
    expect(eyeOf({ x: 0, y: 0, width: 70, height: 70, darkvision: 60 }, scale)).toEqual({ x: 35, y: 35, darkvision: 840 });
  });

  it('a oscuras hace falta luz o visión en la oscuridad, y las paredes tapan la luz', () => {
    const target = { x: 210, y: 0, width: 70, height: 70 };
    const eye = { x: 35, y: 35 };
    expect(seesRect([eye], target, [], 0, null)).toBe(true);
    expect(seesRect([eye], target, [], 0, [])).toBe(false);
    expect(seesRect([{ ...eye, darkvision: 300 }], target, [], 0, [])).toBe(true);
    const torch = lightsOf([{ x: 420, y: 0, width: 70, height: 70, light: { bright: 10, dim: 10, color: '#fff' } }], scale);
    expect(seesRect([eye], target, [], 0, torch)).toBe(true);
    expect(seesRect([eye], target, [wall], 0, torch)).toBe(false);
  });

  it('solo se envían las luces que alumbran algo que el jugador ve', () => {
    const near = lightsOf([{ x: 140, y: 0, width: 70, height: 70, light: { bright: 10, dim: 0, color: '#fff' } }], scale);
    const far = lightsOf([{ x: 560, y: 0, width: 70, height: 70, light: { bright: 10, dim: 0, color: '#fff' } }], scale);
    expect(lightsSeenBy([{ x: 35, y: 35 }], [...near, ...far], [wall], 0)).toEqual(near);
    expect(lightsSeenBy([], near, [], 0)).toEqual([]);
  });

  it('lo explorado a oscuras solo incluye lo iluminado', () => {
    const s = { widthCells: 10, heightCells: 10, gridSize: 70, visionRange: 0, walls: [] as Wall[] };
    const g = exploredGrid(s);
    expect(exploreFrom(s, '', [{ x: 35, y: 35 }], [])).toBeNull();
    const torch = lightsOf([{ x: 560, y: 560, width: 70, height: 70, light: { bright: 5, dim: 0, color: '#fff' } }], scale);
    const bits = decodeExplored(exploreFrom(s, '', [{ x: 35, y: 35 }], torch)!, g);
    const at = (x: number, y: number) => isExplored(bits, g, Math.floor(x / g.size), Math.floor(y / g.size));
    expect(at(595, 595)).toBe(1);
    expect(at(35, 35)).toBe(0);
    expect(at(300, 300)).toBe(0);
    const dv = decodeExplored(exploreFrom(s, '', [{ x: 35, y: 35, darkvision: 140 }], [])!, g);
    expect(isExplored(dv, g, 0, 0)).toBe(1);
  });
});
