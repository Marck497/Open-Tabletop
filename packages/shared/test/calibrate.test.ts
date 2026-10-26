import { describe, expect, it } from 'vitest';
import { calibrateByMarked, calibrateByWidth, fitSceneToImage } from '../src/index.js';

const g = 70;

describe('calibrar la cuadrícula de una imagen', () => {
  it('una imagen con casillas de 100 px, desplazada, queda con casillas de 70 alineadas', () => {
    // Imagen de 20 × 10 casillas de 100 px, puesta en (13, 27); su cuadrícula empieza en su esquina.
    const image = { x: 13, y: 27, width: 2000, height: 1000 };
    // El DM marca 3 × 2 casillas a partir de la casilla (4, 5) de la imagen (con algo de imprecisión).
    const marked = { x: 13 + 400 + 1, y: 27 + 500 - 1, width: 300 - 2, height: 200 + 1 };
    const out = calibrateByMarked(image, marked, 3, 2, g);
    expect(out.width / 20).toBeCloseTo(g, -0.5);
    expect(out.height / 10).toBeCloseTo(g, -0.5);
    // La esquina de la casilla (4, 5) de la imagen cae casi en una línea de la cuadrícula.
    const cornerX = out.x + 4 * (out.width / 20);
    const cornerY = out.y + 5 * (out.height / 10);
    expect(Math.abs(cornerX / g - Math.round(cornerX / g))).toBeLessThan(0.05);
    expect(Math.abs(cornerY / g - Math.round(cornerY / g))).toBeLessThan(0.05);
  });

  it('marcando exacto, el resultado es exacto', () => {
    const image = { x: 0, y: 0, width: 1500, height: 900 };
    const out = calibrateByMarked(image, { x: 300, y: 300, width: 150, height: 150 }, 3, 3, g);
    expect(out).toEqual({ x: 0, y: 0, width: 1500 * (210 / 150), height: 900 * (210 / 150) });
  });

  it('por el ancho en casillas: mantiene la proporción y alinea la esquina', () => {
    const out = calibrateByWidth({ x: 100, y: 40, width: 3000, height: 2000 }, 30, g);
    expect(out).toEqual({ x: 70, y: 70, width: 2100, height: 1400 });
  });

  it('ajustar la escena: lleva la imagen a la esquina sin descalibrarla y da el tamaño en casillas', () => {
    const fit = fitSceneToImage({ x: 140 + 3, y: 70 * 4, width: 2100, height: 1400 }, g);
    expect(fit.image.x).toBe(3);
    expect(fit.image.y).toBe(0);
    expect(fit.widthCells).toBe(30);
    expect(fit.heightCells).toBe(20);
    // Si está casi justo, no añade una casilla de más por un píxel.
    expect(fitSceneToImage({ x: 0, y: 0, width: 70 * 12 + 8, height: 70 * 8 }, g).widthCells).toBe(12);
    expect(fitSceneToImage({ x: 0, y: 0, width: 70 * 12 + 30, height: 70 * 8 }, g).widthCells).toBe(13);
    // Nunca más de 200.
    expect(fitSceneToImage({ x: 0, y: 0, width: 70 * 500, height: 70 }, g).widthCells).toBe(200);
  });
});
