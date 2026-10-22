import { describe, expect, it } from 'vitest';
import {
  canMoveStraight,
  emptyTerrain,
  floodFill,
  generateCave,
  generateDungeon,
  isSolidCell,
  nearestCellEdge,
  paintBrush,
  paintRect,
  resizeTerrain,
  terrainSchema,
  wallsFromTerrain,
  withAutoWalls,
  type Wall,
} from '../src/index.js';

const rows = (t: string, w: number) => t.match(new RegExp(`.{${w}}`, 'g'))!;

/** Casillas abiertas conectadas desde la primera (4 vecinos). */
function connected(t: string, w: number, h: number) {
  const start = [...t].findIndex((c) => !isSolidCell(c));
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    for (const k of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (k < 0 || k >= w * h || seen.has(k) || isSolidCell(t[k])) continue;
      seen.add(k);
      stack.push(k);
    }
  }
  return seen.size === [...t].filter((c) => !isSolidCell(c)).length;
}

describe('pintar terreno', () => {
  it('rectángulo, pincel y cubo', () => {
    let t = paintRect('', 5, 4, 3, 2, 1, 1, 'w');
    expect(rows(t, 5)).toEqual(['.....', '.www.', '.www.', '.....']);
    t = paintBrush(t, 5, 4, 0, 0, 1, 'g');
    expect(t[0]).toBe('g');
    t = paintBrush(t, 5, 4, 4, 3, 3, 'a'); // se recorta en el borde
    expect(rows(t, 5)[3]).toBe('...aa');
    t = floodFill(t, 5, 4, 2, 0, 'n');
    expect(rows(t, 5)).toEqual(['gnnnn', '.wwwn', '.wwaa', '...aa']);
    expect(floodFill(t, 5, 4, 9, 9, 'p')).toBe(t);
  });

  it('valida los códigos y cambia de tamaño conservando la esquina', () => {
    expect(terrainSchema.safeParse('pw.g').success).toBe(true);
    expect(terrainSchema.safeParse('p?').success).toBe(false);
    const t = paintRect('', 3, 2, 0, 0, 2, 1, 'p');
    expect(rows(resizeTerrain(t, 3, 2, 4, 3), 4)).toEqual(['ppp.', 'ppp.', '....']);
    expect(resizeTerrain(t, 3, 2, 2, 1)).toBe('pp');
    expect(resizeTerrain('p.', 3, 2, 4, 4)).toBe(''); // tamaño que no encaja
  });
});

describe('paredes automáticas', () => {
  const g = 10;
  it('rodea una sala con cuatro paredes unidas', () => {
    const t = paintRect(emptyTerrain(5, 5), 5, 5, 1, 1, 3, 3, 'p');
    const walls = wallsFromTerrain(t, 5, 5, g);
    expect(walls).toHaveLength(4);
    expect(walls.every((w) => w.auto && w.kind === 'wall')).toBe(true);
    expect(walls).toContainEqual(expect.objectContaining({ x1: 10, y1: 10, x2: 40, y2: 10 }));
    // Desde dentro no se sale.
    expect(canMoveStraight({ x: 25, y: 25 }, { x: 25, y: 5 }, walls)).toBe(false);
  });

  it('no pone pared entre suelos distintos ni en el borde de la escena', () => {
    const t = paintRect(paintRect('', 4, 1, 0, 0, 1, 0, 'g'), 4, 1, 2, 0, 3, 0, 'a');
    expect(wallsFromTerrain(t, 4, 1, g)).toEqual([]);
  });

  it('respeta las puertas puestas a mano y conserva las paredes manuales', () => {
    const t = paintRect(emptyTerrain(5, 5), 5, 5, 1, 1, 3, 3, 'p');
    const door: Wall = { id: 'd1', x1: 20, y1: 10, x2: 30, y2: 10, kind: 'door', open: false, locked: false };
    const walls = withAutoWalls([door], t, 5, 5, g);
    expect(walls[0]).toBe(door);
    // La pared de arriba queda partida en dos tramos a los lados de la puerta.
    const top = walls.filter((w) => w.auto && w.y1 === 10 && w.y2 === 10);
    expect(top.map((w) => [w.x1, w.x2])).toEqual([
      [10, 20],
      [30, 40],
    ]);
    // Al repintar se sustituyen solo las automáticas.
    expect(withAutoWalls(walls, emptyTerrain(5, 5), 5, 5, g)).toEqual([door]);
  });

  it('lado de casilla más cercano', () => {
    expect(nearestCellEdge(21, 14, 10)).toEqual({ x1: 20, y1: 10, x2: 20, y2: 20 });
    expect(nearestCellEdge(14, 29, 10)).toEqual({ x1: 10, y1: 30, x2: 20, y2: 30 });
  });
});

describe('generadores', () => {
  it('mazmorra: salas conectadas, repetible con la misma semilla y puertas en el borde de las salas', () => {
    const a = generateDungeon(40, 30, { seed: 7 });
    expect(a).toEqual(generateDungeon(40, 30, { seed: 7 }));
    expect(a.terrain).toHaveLength(1200);
    expect(terrainSchema.safeParse(a.terrain).success).toBe(true);
    expect([...a.terrain].filter((c) => c === 'p').length).toBeGreaterThan(40);
    expect(connected(a.terrain, 40, 30)).toBe(true);
    for (const d of a.doors) expect(Math.abs(d.x2 - d.x1) + Math.abs(d.y2 - d.y1)).toBe(1);
    expect(generateDungeon(40, 30, { seed: 8 }).terrain).not.toBe(a.terrain);
  });

  it('cueva: una sola zona abierta rodeada de roca', () => {
    const c = generateCave(30, 20, { seed: 3 });
    expect(c.terrain).toHaveLength(600);
    expect(c.terrain).toMatch(/^[or]+$/);
    expect([...c.terrain].filter((x) => x === 'o').length).toBeGreaterThan(100);
    expect(connected(c.terrain, 30, 20)).toBe(true);
    expect(rows(c.terrain, 30)[0]).toBe('r'.repeat(30));
  });
});
