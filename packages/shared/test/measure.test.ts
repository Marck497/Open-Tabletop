import { describe, expect, it } from 'vitest';
import { cellsInArea, formatDistance, measureCells, pathCells, type DistanceSettings } from '../src/index.js';

const g = 70;
const base: DistanceSettings = { gridSize: g, cellDistance: 5, distanceUnit: 'pies', diagonalRule: '5e' };
const c = (col: number, row: number) => ({ x: (col + 0.5) * g, y: (row + 0.5) * g });
const scene = { gridSize: g, widthCells: 30, heightCells: 30 };

describe('distancias', () => {
  it('5e: las diagonales cuentan 1', () => {
    expect(pathCells([c(0, 0), c(4, 4)], base)).toBe(4);
    expect(pathCells([c(0, 0), c(6, 2)], base)).toBe(6);
    expect(formatDistance(pathCells([c(0, 0), c(6, 2)], base), base)).toBe('30 pies');
  });

  it('1-2-1: cada segunda diagonal cuenta doble, también entre tramos', () => {
    const alt = { ...base, diagonalRule: 'alt' as const };
    expect(pathCells([c(0, 0), c(4, 4)], alt)).toBe(6);
    expect(pathCells([c(0, 0), c(3, 3)], alt)).toBe(4);
    // 1 diagonal + 1 diagonal en otro tramo = 1 + 2
    expect(pathCells([c(0, 0), c(1, 1), c(2, 0)], alt)).toBe(3);
  });

  it('euclídea y por tramos', () => {
    const eu = { ...base, diagonalRule: 'euclid' as const };
    expect(pathCells([c(0, 0), c(3, 4)], eu)).toBeCloseTo(5);
    expect(pathCells([c(0, 0), c(2, 0), c(2, 3)], base)).toBe(5);
  });

  it('plantillas: el tamaño es el radio o el lado', () => {
    expect(measureCells({ shape: 'circle', points: [c(5, 5), c(5, 9)] }, base)).toBe(4);
    expect(measureCells({ shape: 'square', points: [c(5, 5), c(8, 6)] }, base)).toBe(3);
  });
});

describe('áreas', () => {
  it('círculo de radio 1 casilla: la casilla central y sus 4 vecinas', () => {
    const cells = cellsInArea({ shape: 'circle', points: [c(5, 5), c(5, 6)] }, scene);
    expect(cells).toHaveLength(5);
  });

  it('cono de 3 casillas hacia la derecha: se abre y no va hacia atrás', () => {
    const origin = { x: 5 * g, y: 5.5 * g };
    const cells = cellsInArea({ shape: 'cone', points: [origin, { x: 8 * g, y: 5.5 * g }] }, scene);
    const key = cells.map((x) => `${x.col},${x.row}`);
    expect(key).toContain('5,5');
    expect(key).toContain('7,6');
    expect(key).toContain('7,4');
    expect(key).not.toContain('4,5');
    expect(key).not.toContain('5,7');
  });

  it('línea de 1 casilla de ancho', () => {
    const cells = cellsInArea({ shape: 'line', points: [{ x: 0, y: 2.5 * g }, { x: 6 * g, y: 2.5 * g }] }, scene);
    expect(cells.every((x) => x.row === 2)).toBe(true);
    expect(cells).toHaveLength(6);
  });

  it('cubo hacia arriba a la izquierda y la regla no marca casillas', () => {
    expect(cellsInArea({ shape: 'square', points: [{ x: 5 * g, y: 5 * g }, { x: 3 * g, y: 4 * g }] }, scene)).toHaveLength(4);
    expect(cellsInArea({ shape: 'ruler', points: [c(0, 0), c(3, 3)] }, scene)).toEqual([]);
  });

  it('no sale de la escena', () => {
    const cells = cellsInArea({ shape: 'circle', points: [c(0, 0), c(0, 3)] }, scene);
    expect(cells.every((x) => x.col >= 0 && x.row >= 0)).toBe(true);
  });
});
