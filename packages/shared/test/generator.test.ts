import { describe, expect, it } from 'vitest';
import { generateStyled, isSolidCell, MAP_STYLES, MAP_STYLE_DEFS } from '../src/index.js';

const W = 40;
const H = 30;

describe('generador de mapas con estilos', () => {
  it('cada estilo da siempre el mismo mapa con la misma semilla y usa su suelo', () => {
    for (const style of MAP_STYLES) {
      const a = generateStyled(W, H, { seed: 11, style });
      expect(generateStyled(W, H, { seed: 11, style }), style).toEqual(a);
      expect(generateStyled(W, H, { seed: 12, style }).terrain, style).not.toBe(a.terrain);
      expect(a.terrain.includes(MAP_STYLE_DEFS[style].floor), style).toBe(true);
    }
  });

  it('los objetos van sobre el suelo, dentro de las salas, sin repetir casilla ni tapar entradas o puertas', () => {
    for (const style of MAP_STYLES) {
      for (let seed = 1; seed <= 15; seed++) {
        const map = generateStyled(W, H, { seed, style });
        const t = map.terrain;
        const solid = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || isSolidCell(t[y * W + x]);
        expect(map.objects.length, `${style} ${seed}`).toBeGreaterThan(0);
        expect(new Set(map.objects.map((o) => `${o.x},${o.y}`)).size).toBe(map.objects.length);
        for (const o of map.objects) {
          expect(solid(o.x, o.y), `${style} ${seed}: ${o.emoji} en ${o.x},${o.y}`).toBe(false);
          if (style === 'cave') continue;
          const room = map.rooms!.find((r) => o.x >= r.x && o.y >= r.y && o.x < r.x + r.w && o.y < r.y + r.h);
          expect(room, `${style} ${seed}: ${o.emoji} fuera de las salas`).toBeTruthy();
          // Ninguna casilla vecina es suelo de fuera de la sala (sería una entrada).
          for (const [nx, ny] of [
            [o.x + 1, o.y],
            [o.x - 1, o.y],
            [o.x, o.y + 1],
            [o.x, o.y - 1],
          ] as const) {
            const outside = nx < room!.x || ny < room!.y || nx >= room!.x + room!.w || ny >= room!.y + room!.h;
            expect(outside && !solid(nx, ny), `${style} ${seed}: ${o.emoji} tapa una entrada en ${o.x},${o.y}`).toBe(false);
          }
          // Ni junto a una puerta.
          for (const d of map.doors) {
            const sides = d.x1 === d.x2 ? [[d.x1 - 1, d.y1], [d.x1, d.y1]] : [[d.x1, d.y1 - 1], [d.x1, d.y1]];
            expect(sides.some(([x, y]) => x === o.x && y === o.y), `${style} ${seed}: ${o.emoji} junto a una puerta`).toBe(false);
          }
        }
        if (style !== 'cave') expect(map.roomKinds).toHaveLength(map.rooms!.length);
      }
    }
  });

  it('hay luz donde toca: antorchas en la mazmorra, velas en la cripta, ninguna en la cueva', () => {
    const lit = (style: (typeof MAP_STYLES)[number]) => generateStyled(W, H, { seed: 3, style }).objects.filter((o) => o.light);
    expect(lit('dungeon').some((o) => o.emoji === '🔥' && o.light!.bright === 20)).toBe(true);
    expect(lit('crypt').every((o) => o.emoji === '🕯️')).toBe(true);
    expect(lit('crypt').length).toBeGreaterThan(0);
    expect(lit('cave')).toEqual([]);
  });

  it('sin amueblar, el mismo plano y ningún objeto; más o menos salas según el tamaño', () => {
    const full = generateStyled(W, H, { seed: 5, style: 'dungeon' });
    const bare = generateStyled(W, H, { seed: 5, style: 'dungeon', furnish: false });
    expect(bare.objects).toEqual([]);
    expect(bare.terrain).toBe(full.terrain);
    const few = generateStyled(W, H, { seed: 5, style: 'dungeon', size: 'few' }).rooms!.length;
    const many = generateStyled(W, H, { seed: 5, style: 'dungeon', size: 'many' }).rooms!.length;
    expect(few).toBeLessThan(many);
    // Las alcantarillas tienen canales de agua.
    expect(generateStyled(W, H, { seed: 5, style: 'sewer' }).terrain.includes('a')).toBe(true);
  });
});
