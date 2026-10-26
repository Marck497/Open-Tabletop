import { describe, expect, it } from 'vitest';
import { imageMimeOf, looksLikeUvtt, scenePackageSchema, simplifyPolyline, uvttToScenePackage } from '../src/index.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Un mapa como los que exporta Dungeondraft: 4 × 3 casillas, una sala con puerta y una antorcha. */
const dd2vtt = {
  format: 0.3,
  resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 4, y: 3 }, pixels_per_grid: 100 },
  // Pared en L con un punto intermedio en línea recta (se debe juntar en un solo tramo).
  line_of_sight: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ],
  ],
  objects_line_of_sight: [],
  portals: [{ position: { x: 2, y: 2.5 }, bounds: [{ x: 2, y: 2 }, { x: 2, y: 3 }], rotation: 0, closed: true, freestanding: false }],
  environment: { baked_lighting: true, ambient_light: 'ffffffff' },
  lights: [{ position: { x: 1, y: 1 }, range: 8, intensity: 1, color: 'ffff8800', shadows: true }],
  image: PNG,
};

describe('mapas Universal VTT (Dungeondraft)', () => {
  it('reconoce el formato y el tipo de imagen', () => {
    expect(looksLikeUvtt(dd2vtt)).toBe(true);
    expect(looksLikeUvtt({ format: 'vtt-scene' })).toBe(false);
    expect(imageMimeOf(PNG)).toBe('image/png');
    expect(imageMimeOf('/9j/4AAQSkZJRgABAQ')).toBe('image/jpeg');
    expect(imageMimeOf(btoa('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(imageMimeOf('aG9sYQ==')).toBeNull();
  });

  it('junta los tramos en línea recta', () => {
    expect(simplifyPolyline([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }])).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }]);
  });

  it('convierte el mapa en una escena con imagen, paredes, puerta y luz', () => {
    const pkg = scenePackageSchema.parse(uvttToScenePackage(dd2vtt, 'Taberna del puerto'));
    expect(pkg.scene).toMatchObject({ name: 'Taberna del puerto', widthCells: 4, heightCells: 3, gridSize: 70, vision: true, lighting: false });
    // Dos tramos de pared (el punto intermedio sobra) y la puerta, en píxeles de la escena.
    // Ya están dibujadas en la imagen: no se pintan encima.
    expect(pkg.scene.walls.every((w) => w.onImage)).toBe(true);
    expect(pkg.scene.walls.map(({ x1, y1, x2, y2, kind, open }) => ({ x1, y1, x2, y2, kind, open }))).toEqual([
      { x1: 0, y1: 0, x2: 140, y2: 0, kind: 'wall', open: false },
      { x1: 140, y1: 0, x2: 140, y2: 140, kind: 'wall', open: false },
      { x1: 140, y1: 140, x2: 140, y2: 210, kind: 'door', open: false },
    ]);
    // La imagen ocupa toda la escena en la capa Mapa.
    expect(pkg.items[0]).toMatchObject({ layer: 'map', x: 0, y: 0, width: 280, height: 210, assetId: 'mapa' });
    expect(pkg.assets[0]).toMatchObject({ id: 'mapa', mime: 'image/png', data: PNG });
    // La luz: invisible (capa del DM), centrada en su punto, 8 casillas = 40 pies (20 brillante + 20 tenue) y su color.
    expect(pkg.items[1]).toMatchObject({ layer: 'gm', x: 52.5, y: 52.5, width: 35, height: 35, light: { bright: 20, dim: 20, color: '#ff8800' } });
  });

  it('tiene en cuenta el origen del mapa y avisa de lo que no vale', () => {
    const moved = uvttToScenePackage({ ...dd2vtt, resolution: { ...dd2vtt.resolution, map_origin: { x: 10, y: 5 } }, line_of_sight: [[{ x: 10, y: 5 }, { x: 11, y: 5 }]], portals: [], lights: [] }, 'X');
    expect(moved.scene.walls).toEqual([expect.objectContaining({ x1: 0, y1: 0, x2: 70, y2: 0 })]);
    expect(() => uvttToScenePackage({ ...dd2vtt, image: 'aG9sYQ==' }, 'X')).toThrow(/no es PNG, JPG ni WEBP/);
    expect(() => uvttToScenePackage({ ...dd2vtt, resolution: { map_size: { x: 300, y: 10 } } }, 'X')).toThrow(/300 × 10/);
    expect(() => uvttToScenePackage({ resolution: {} }, 'X')).toThrow(/Mapa no válido/);
    // Sin paredes, sin visión dinámica.
    expect(uvttToScenePackage({ ...dd2vtt, line_of_sight: [], portals: [] }, 'X').scene.vision).toBe(false);
  });
});
