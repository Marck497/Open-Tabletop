import { describe, expect, it } from 'vitest';
import { decodeExplored, encodeExplored, exploredGrid, exploreFrom, isExplored, type Wall } from '../src/index.js';

const scene = (walls: Wall[] = [], visionRange = 0) => ({ widthCells: 10, heightCells: 10, gridSize: 70, visionRange, walls });

describe('zonas exploradas', () => {
  it('usa más subcasillas en escenas pequeñas y como mucho 400 por lado', () => {
    expect(exploredGrid({ widthCells: 10, heightCells: 10, gridSize: 70 })).toEqual({ cols: 40, rows: 40, size: 17.5 });
    expect(exploredGrid({ widthCells: 200, heightCells: 50, gridSize: 70 })).toMatchObject({ cols: 400, rows: 100 });
  });

  it('marca lo que se ve, no lo que hay detrás de una pared, y no cambia si no hay nada nuevo', () => {
    const wall: Wall = { id: 'w', x1: 350, y1: 0, x2: 350, y2: 700, kind: 'wall', open: false, locked: false };
    const s = scene([wall]);
    const text = exploreFrom(s, '', [{ x: 105, y: 105 }]);
    expect(text).toBeTruthy();
    const g = exploredGrid(s);
    const bits = decodeExplored(text!, g);
    expect(isExplored(bits, g, 2, 2)).toBe(1);
    expect(isExplored(bits, g, 18, 30)).toBe(1); // A este lado de la pared.
    expect(isExplored(bits, g, 25, 5)).toBe(0); // Al otro lado.
    expect(exploreFrom(s, text!, [{ x: 105, y: 105 }])).toBeNull();
    // Se suma a lo anterior: al otro lado ahora sí, y lo de antes sigue.
    const more = decodeExplored(exploreFrom(s, text!, [{ x: 600, y: 600 }])!, g);
    expect(isExplored(more, g, 2, 2)).toBe(1);
    expect(isExplored(more, g, 25, 5)).toBe(1);
  });

  it('respeta el alcance de la visión', () => {
    const s = scene([], 1);
    const g = exploredGrid(s);
    const bits = decodeExplored(exploreFrom(s, '', [{ x: 35, y: 35 }])!, g);
    expect(isExplored(bits, g, 1, 1)).toBe(1);
    expect(isExplored(bits, g, 20, 20)).toBe(0);
  });

  it('lo vacío se guarda como texto vacío y lo que no encaja se ignora', () => {
    const g = exploredGrid(scene());
    expect(encodeExplored(new Uint8Array(200))).toBe('');
    expect(decodeExplored('AAAA', g).every((b) => b === 0)).toBe(true);
  });
});
