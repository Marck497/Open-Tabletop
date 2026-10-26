import { describe, expect, it } from 'vitest';
import { fitPrefab, isSolidCell, lightsOf, paintPrefab, PREFABS, rotatePrefab, terrainById, type Prefab } from '../src/index.js';

const at = (rows: string[], x: number, y: number) => rows[y]?.[x];

describe('salas prediseñadas', () => {
  it('todas tienen un plano válido, objetos sobre el suelo y puertas junto al suelo', () => {
    expect(new Set(PREFABS.map((p) => p.id)).size).toBe(PREFABS.length);
    for (const p of PREFABS) {
      const w = p.rows[0]!.length;
      expect(p.rows.every((r) => r.length === w), p.id).toBe(true);
      for (const code of p.rows.join('')) expect(code === '.' || !!terrainById(code), `${p.id}: ${code}`).toBe(true);
      for (const [emoji, x, y, size = 1] of p.objects) {
        for (let dy = 0; dy < size; dy++)
          for (let dx = 0; dx < size; dx++) expect(isSolidCell(at(p.rows, x + dx, y + dy)), `${p.id}: ${emoji} en ${x + dx},${y + dy}`).toBe(false);
      }
      // Cada puerta toca al menos una casilla de suelo de la sala.
      for (const d of rotatePrefab(p, 0).doors) {
        const cells =
          d.x1 === d.x2
            ? [at(p.rows, d.x1 - 1, d.y1), at(p.rows, d.x1, d.y1)]
            : [at(p.rows, d.x1, d.y1 - 1), at(p.rows, d.x1, d.y1)];
        expect(cells.some((c) => !isSolidCell(c)), `${p.id}: puerta ${JSON.stringify(d)}`).toBe(true);
      }
    }
  });

  it('gira el plano, las puertas y los objetos', () => {
    const p: Prefab = {
      id: 't',
      name: 'Prueba',
      icon: '',
      group: 'Pueblo',
      description: '',
      // 3 de ancho y 2 de alto: la "w" en la esquina de arriba a la izquierda.
      rows: ['wpp', 'ppp'],
      doors: [[0, 0, 'n']],
      objects: [['🔥', 2, 1, 1, 'hoguera'], ['⛺', 0, 0, 2]],
    };
    const r = rotatePrefab(p, 1);
    expect([r.w, r.h]).toEqual([2, 3]);
    // Un cuarto de vuelta: la esquina de arriba a la izquierda pasa a la de arriba a la derecha.
    expect(r.rows).toEqual(['pw', 'pp', 'pp']);
    // La puerta de arriba pasa a la derecha.
    expect(r.doors).toEqual([{ x1: 2, y1: 0, x2: 2, y2: 1, locked: false }]);
    expect(r.objects[0]).toMatchObject({ emoji: '🔥', x: 0, y: 2, size: 1, light: { bright: 20, dim: 20 } });
    expect(r.objects[1]).toMatchObject({ emoji: '⛺', x: 0, y: 0, size: 2 });
    // Cuatro cuartos de vuelta: como estaba.
    expect(rotatePrefab(p, 4)).toEqual(rotatePrefab(p, 0));
    expect(rotatePrefab(p, -1)).toEqual(rotatePrefab(p, 3));
    // Cada giro conserva las casillas y la cantidad de suelo.
    for (const pre of PREFABS) {
      const r3 = rotatePrefab(pre, 3);
      expect(r3.rows.join('').split('').sort().join('')).toBe(pre.rows.join('').split('').sort().join(''));
      expect(r3.objects).toHaveLength(pre.objects.length);
    }
  });

  it('coloca la sala centrada en el ratón sin salirse de la escena', () => {
    expect(fitPrefab({ w: 5, h: 3 }, 20, 10, 10, 5)).toEqual({ x: 8, y: 4 });
    expect(fitPrefab({ w: 5, h: 3 }, 20, 10, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(fitPrefab({ w: 5, h: 3 }, 20, 10, 19, 9)).toEqual({ x: 15, y: 7 });
    expect(fitPrefab({ w: 21, h: 3 }, 20, 10, 5, 5)).toBeNull();
  });

  it('pinta solo las casillas del plano y respeta las vacías', () => {
    const placed = rotatePrefab({ id: 't', name: '', icon: '', group: 'Pueblo', description: '', rows: ['.w', 'ww'], doors: [], objects: [] }, 0);
    expect(paintPrefab('g'.repeat(9), 3, 3, placed, 1, 1)).toBe('gggggwgww');
    expect(paintPrefab('', 3, 3, placed, 0, 0)).toBe('.w.ww....');
  });

  it('los objetos dan luz; el resto de dibujos, no', () => {
    const light = { bright: 20, dim: 20, color: '#fff' };
    const scale = { gridSize: 70, cellDistance: 5 };
    expect(lightsOf([{ x: 0, y: 0, width: 70, height: 70, light, drawing: { type: 'stamp' } }], scale)).toHaveLength(1);
    expect(lightsOf([{ x: 0, y: 0, width: 70, height: 70, light, drawing: { type: 'rect' } }], scale)).toHaveLength(0);
  });
});
