import type { Light } from '../schemas/lights.js';
import { isSolidCell, type CellRect, type GeneratedMap } from '../schemas/terrain.js';
import { PREFAB_LIGHTS, type PrefabLight } from './prefabs.js';

/**
 * Amueblar salas generadas (las de una mazmorra o las casas de un pueblo): a cada sala le toca un
 * uso y se llena con sus objetos en esquinas, junto a las paredes o en el centro.
 */

/** Dónde va un objeto dentro de la sala. */
export type Spot = 'corner' | 'wall' | 'center' | 'any';

/** Objeto de un uso de sala: emoji, dónde, cuántos (mínimo y máximo) y la luz que da. */
export type Furniture = [emoji: string, where: Spot, min: number, max: number, light?: PrefabLight];

export interface RoomKind {
  name: string;
  items: Furniture[];
}

/** Lo que coloca el generador: un objeto (emoji) en una casilla, con su tamaño y luz. */
export interface GeneratedObject {
  emoji: string;
  x: number;
  y: number;
  size: number;
  light: Light | null;
}

export const TORCH: Furniture = ['🔥', 'wall', 1, 1, 'antorcha'];

/** Casillas a los dos lados de cada puerta: ahí no se pone nada para no tapar el paso. */
export function doorCells(map: GeneratedMap): Set<number> {
  const out = new Set<number>();
  const key = (x: number, y: number) => y * 100000 + x;
  for (const d of map.doors) {
    if (d.x1 === d.x2) {
      out.add(key(d.x1 - 1, d.y1));
      out.add(key(d.x1, d.y1));
    } else {
      out.add(key(d.x1, d.y1 - 1));
      out.add(key(d.x1, d.y1));
    }
  }
  return out;
}

/**
 * Amuebla las salas del mapa: `kindOf` da el uso de cada una. Sin tapar entradas ni puertas.
 * Con `walled`, las salas tienen paredes propias (casas): lo de fuera cuenta como pared y no hay entradas
 * abiertas, solo puertas.
 */
export function furnishRoomKinds(
  map: GeneratedMap,
  w: number,
  h: number,
  kindOf: (room: CellRect, n: number) => RoomKind,
  rnd: () => number,
  opts: { torches?: boolean; walled?: boolean } = {},
): { objects: GeneratedObject[]; roomKinds: string[] } {
  const rooms = map.rooms ?? [];
  const objects: GeneratedObject[] = [];
  const roomKinds: string[] = [];
  const t = map.terrain;
  const inRoom = (r: CellRect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  const doors = doorCells(map);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  rooms.forEach((r, n) => {
    const kind = kindOf(r, n);
    roomKinds.push(kind.name);
    const solid = (x: number, y: number) => (opts.walled && !inRoom(r, x, y)) || x < 0 || y < 0 || x >= w || y >= h || isSolidCell(t[y * w + x]);
    const cells: { x: number; y: number; walls: number }[] = [];
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        // Entrada: casilla de la sala que toca suelo de fuera (un pasillo). Se deja libre, igual que las de las puertas.
        const neighbours = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ] as const;
        if (neighbours.some(([nx, ny]) => !inRoom(r, nx, ny) && !solid(nx, ny))) continue;
        if (doors.has(y * 100000 + x)) continue;
        cells.push({ x, y, walls: neighbours.filter(([nx, ny]) => solid(nx, ny)).length });
      }
    const used = new Set<string>();
    const fits = (c: { x: number; y: number; walls: number }, where: Spot) =>
      !used.has(`${c.x},${c.y}`) && (where === 'any' || (where === 'corner' ? c.walls >= 2 : where === 'wall' ? c.walls >= 1 : c.walls === 0));
    const place = (emoji: string, where: Spot, light?: PrefabLight) => {
      let options = cells.filter((c) => fits(c, where));
      // Si no hay sitio del tipo pedido (sala muy pequeña), vale cualquiera libre.
      if (!options.length) options = cells.filter((c) => fits(c, 'any'));
      if (!options.length) return;
      const c = options[Math.floor(rnd() * options.length)]!;
      used.add(`${c.x},${c.y}`);
      objects.push({ emoji, x: c.x, y: c.y, size: 1, light: light ? PREFAB_LIGHTS[light] : null });
    };
    const items = opts.torches ? [...kind.items, TORCH] : kind.items;
    for (const [emoji, where, min, max, light] of items) {
      const count = int(min, max);
      for (let i = 0; i < count; i++) place(emoji, where, light);
    }
  });
  return { objects, roomKinds };
}
