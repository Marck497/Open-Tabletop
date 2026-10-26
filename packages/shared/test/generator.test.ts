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
          if (style === 'cave' || MAP_STYLE_DEFS[style].outdoor) continue;
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
        if (style !== 'cave' && !MAP_STYLE_DEFS[style].outdoor) expect(map.roomKinds).toHaveLength(map.rooms!.length);
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

  describe('exteriores', () => {
    const OUTDOOR = MAP_STYLES.filter((s) => MAP_STYLE_DEFS[s].outdoor);
    const cell = (map: { terrain: string }, x: number, y: number) => map.terrain[y * W + x];

    it('son todo suelo (sin paredes alrededor) y no ponen nada en el agua ni en caminos', () => {
      expect(OUTDOOR).toEqual(['forest', 'road', 'village']);
      for (const style of OUTDOOR)
        for (let seed = 1; seed <= 20; seed++) {
          const map = generateStyled(W, H, { seed, style });
          expect([...map.terrain].some((c) => isSolidCell(c)), `${style} ${seed}`).toBe(false);
          for (const o of map.objects) {
            // Salvo el carro volcado, que está en mitad del camino a propósito.
            if (style === 'road' && ['🛢️', '📦'].includes(o.emoji)) continue;
            expect(['a', 'd'], `${style} ${seed}: ${o.emoji} en ${o.x},${o.y}`).not.toContain(cell(map, o.x, o.y));
          }
          // Sin sobrepasar el tope de objetos (por rendimiento en la Raspberry).
          expect(map.objects.length, `${style} ${seed}`).toBeLessThanOrEqual(220);
          // Hay camino o calle que cruza el mapa de lado a lado.
          expect(map.terrain.includes('d'), `${style} ${seed}`).toBe(true);
        }
    });

    it('el bosque tiene arboleda con árboles y un camino de borde a borde', () => {
      for (let seed = 1; seed <= 10; seed++) {
        const map = generateStyled(W, H, { seed, style: 'forest' });
        expect(map.terrain.includes('f')).toBe(true);
        expect(map.objects.filter((o) => o.emoji === '🌲' || o.emoji === '🌳').length).toBeGreaterThan(10);
        const cols = new Set<number>();
        const rows = new Set<number>();
        [...map.terrain].forEach((c, i) => {
          if (c !== 'd' && c !== 'w') return;
          cols.add(i % W);
          rows.add(Math.floor(i / W));
        });
        expect(cols.size === W || rows.size === H, `semilla ${seed}`).toBe(true);
      }
      // Más espeso con «muchos».
      const forestCells = (size: 'few' | 'many') => {
        let n = 0;
        for (let seed = 1; seed <= 10; seed++) n += [...generateStyled(W, H, { seed, style: 'forest', size }).terrain].filter((c) => c === 'f').length;
        return n;
      };
      expect(forestCells('many')).toBeGreaterThan(forestCells('few'));
    });

    it('el camino a veces cruza un río por un puente, y tiene su carro volcado', () => {
      const maps = Array.from({ length: 20 }, (_, i) => generateStyled(W, H, { seed: i + 1, style: 'road' }));
      expect(maps.filter((m) => m.objects.some((o) => o.emoji === '🛢️' && cell(m, o.x, o.y) === 'd')).length).toBeGreaterThan(15);
      const withRiver = maps.filter((m) => m.terrain.includes('a'));
      expect(withRiver.length).toBeGreaterThan(3);
      // Donde el camino cruza el río hay puente (madera), nunca camino sobre el agua.
      for (const m of withRiver) expect(m.terrain.includes('w')).toBe(true);
    });

    it('las casas del pueblo no se pisan, tienen paredes cerradas salvo una puerta que da fuera, y su uso', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const map = generateStyled(W, H, { seed, style: 'village' });
        const houses = map.rooms!;
        expect(houses.length, `semilla ${seed}`).toBeGreaterThan(2);
        expect(map.roomKinds).toHaveLength(houses.length);
        expect(map.roomKinds).toContain('Taberna');
        expect(map.doors).toHaveLength(houses.length);
        for (const r of houses) {
          for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) expect(cell(map, x, y)).toBe('w');
          for (const o of houses) if (o !== r) expect(r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y).toBe(false);
          // El perímetro: cada lado de casilla del borde está tapado por una pared o por la puerta (solo una).
          const covered = (x1: number, y1: number, x2: number, y2: number, list: { x1: number; y1: number; x2: number; y2: number }[]) =>
            list.filter((s) =>
              y1 === y2
                ? s.y1 === s.y2 && s.y1 === y1 && Math.min(s.x1, s.x2) <= x1 && Math.max(s.x1, s.x2) >= x2
                : s.x1 === s.x2 && s.x1 === x1 && Math.min(s.y1, s.y2) <= y1 && Math.max(s.y1, s.y2) >= y2,
            ).length;
          let doors = 0;
          const edges: [number, number, number, number][] = [];
          for (let x = r.x; x < r.x + r.w; x++) edges.push([x, r.y, x + 1, r.y], [x, r.y + r.h, x + 1, r.y + r.h]);
          for (let y = r.y; y < r.y + r.h; y++) edges.push([r.x, y, r.x, y + 1], [r.x + r.w, y, r.x + r.w, y + 1]);
          for (const [x1, y1, x2, y2] of edges) {
            const wall = covered(x1, y1, x2, y2, map.walls!);
            const door = covered(x1, y1, x2, y2, map.doors);
            expect(wall + door, `semilla ${seed}: lado ${x1},${y1}-${x2},${y2}`).toBe(1);
            doors += door;
          }
          expect(doors).toBe(1);
        }
        // Los muebles de cada casa, dentro de ella y sin tapar la puerta.
        for (const o of map.objects.filter((o) => cell(map, o.x, o.y) === 'w')) {
          const house = houses.find((r) => o.x >= r.x && o.y >= r.y && o.x < r.x + r.w && o.y < r.y + r.h);
          expect(house).toBeTruthy();
          for (const d of map.doors) {
            const inside = d.x1 === d.x2 ? [[d.x1 - 1, d.y1], [d.x1, d.y1]] : [[d.x1, d.y1 - 1], [d.x1, d.y1]];
            expect(inside.some(([x, y]) => x === o.x && y === o.y), `semilla ${seed}: ${o.emoji} tapa la puerta`).toBe(false);
          }
        }
        // Plaza con su pozo.
        expect(map.objects.some((o) => o.emoji === '⛲' && cell(map, o.x, o.y) === 'c')).toBe(true);
      }
    });

    it('sin amueblar: el mismo plano, sin objetos (las casas mantienen sus paredes)', () => {
      for (const style of OUTDOOR) {
        const full = generateStyled(W, H, { seed: 4, style });
        const bare = generateStyled(W, H, { seed: 4, style, furnish: false });
        expect(bare.terrain, style).toBe(full.terrain);
        expect(bare.objects).toEqual([]);
        expect(bare.walls ?? [], style).toEqual(full.walls ?? []);
      }
    });

    it('funcionan también en escenas pequeñas', () => {
      for (const style of OUTDOOR) for (const [w, h] of [[8, 6], [12, 10], [6, 20]] as const) expect(() => generateStyled(w, h, { seed: 2, style }), `${style} ${w}x${h}`).not.toThrow();
    });
  });
});
