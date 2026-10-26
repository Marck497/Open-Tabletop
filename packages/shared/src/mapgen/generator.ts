import type { Light } from '../schemas/lights.js';
import { generateCave, generateDungeon, isSolidCell, seededRng, type CellRect, type GeneratedMap } from '../schemas/terrain.js';
import { PREFAB_LIGHTS, type PrefabLight } from './prefabs.js';

/**
 * Generador de mapas con estilos (mazmorra, cripta, castillo, alcantarillas, mina, cueva) y
 * amueblado: a cada sala le toca un uso (almacén, cuartel, tumbas…) y se llena con sus objetos
 * y alguna antorcha. Todo con semilla: la misma semilla da el mismo mapa.
 */

/** Dónde va un objeto dentro de la sala. */
type Spot = 'corner' | 'wall' | 'center' | 'any';

/** Objeto de un uso de sala: emoji, dónde, cuántos (mínimo y máximo) y la luz que da. */
type Furniture = [emoji: string, where: Spot, min: number, max: number, light?: PrefabLight];

interface RoomKind {
  name: string;
  items: Furniture[];
}

export const MAP_STYLES = ['dungeon', 'crypt', 'castle', 'sewer', 'mine', 'cave'] as const;
export type MapStyle = (typeof MAP_STYLES)[number];

export const MAP_SIZES = ['few', 'normal', 'many'] as const;
export type MapSize = (typeof MAP_SIZES)[number];
export const MAP_SIZE_LABELS: Record<MapSize, string> = { few: 'Pocas salas', normal: 'Normal', many: 'Muchas salas' };

interface StyleDef {
  name: string;
  icon: string;
  description: string;
  floor: string;
  corridor: string;
  minRoom: number;
  maxRoom: number;
  /** Salas por cada 90 casillas de escena (con «Normal»). */
  density: number;
  /** Antorchas en las paredes de las salas (con luz). */
  torches: number;
  kinds: RoomKind[];
}

const TORCH: Furniture = ['🔥', 'wall', 1, 1, 'antorcha'];

export const MAP_STYLE_DEFS: Record<MapStyle, StyleDef> = {
  dungeon: {
    name: 'Mazmorra',
    icon: '🏰',
    description: 'Salas de piedra unidas por pasillos, con almacenes, cuarteles, celdas y algún tesoro.',
    floor: 'p',
    corridor: 'c',
    minRoom: 3,
    maxRoom: 9,
    density: 1,
    torches: 1,
    kinds: [
      { name: 'Almacén', items: [['📦', 'corner', 2, 3], ['🛢️', 'wall', 1, 3], ['🧰', 'wall', 0, 1]] },
      { name: 'Cuartel', items: [['🛏️', 'wall', 2, 3], ['⚔️', 'wall', 1, 1], ['🪑', 'center', 1, 2], ['🍖', 'center', 0, 1]] },
      { name: 'Celda', items: [['⛓️', 'wall', 1, 2], ['💀', 'corner', 0, 1], ['🦴', 'any', 0, 2]] },
      { name: 'Tesoro', items: [['💰', 'center', 1, 2], ['💎', 'any', 0, 1], ['🧰', 'corner', 1, 1], ['🪤', 'any', 0, 1]] },
      { name: 'Guarida', items: [['🦴', 'any', 1, 3], ['💀', 'corner', 1, 1], ['🕸️', 'corner', 1, 2]] },
      { name: 'Sala vacía', items: [['🪨', 'any', 0, 2], ['🕸️', 'corner', 0, 1]] },
    ],
  },
  crypt: {
    name: 'Cripta',
    icon: '⚰️',
    description: 'Tumbas, osarios y capillas a la luz de las velas.',
    floor: 'p',
    corridor: 'p',
    minRoom: 3,
    maxRoom: 8,
    density: 1,
    torches: 0,
    kinds: [
      { name: 'Tumbas', items: [['⚰️', 'center', 2, 4], ['🕯️', 'wall', 1, 2, 'vela']] },
      { name: 'Osario', items: [['💀', 'any', 2, 4], ['🦴', 'any', 2, 4], ['🕸️', 'corner', 1, 2]] },
      { name: 'Capilla', items: [['🗿', 'wall', 1, 1], ['🕯️', 'wall', 2, 3, 'vela'], ['📜', 'center', 0, 1]] },
      { name: 'Sala de ofrendas', items: [['🏺', 'wall', 2, 3], ['💰', 'center', 0, 1], ['🕯️', 'corner', 1, 1, 'vela']] },
    ],
  },
  castle: {
    name: 'Castillo',
    icon: '👑',
    description: 'Salas grandes de mármol: trono, comedor, dormitorios, armería, biblioteca y cocina.',
    floor: 'm',
    corridor: 'p',
    minRoom: 4,
    maxRoom: 11,
    density: 0.6,
    torches: 0,
    kinds: [
      { name: 'Sala del trono', items: [['👑', 'wall', 1, 1], ['🏳️', 'corner', 2, 2], ['🛡️', 'wall', 1, 2], ['🪔', 'wall', 2, 2, 'lampara']] },
      { name: 'Comedor', items: [['🍖', 'center', 2, 3], ['🪑', 'center', 2, 4], ['🍺', 'center', 0, 2], ['🪔', 'wall', 1, 2, 'lampara']] },
      { name: 'Dormitorio', items: [['🛏️', 'wall', 1, 2], ['🧰', 'corner', 1, 1], ['🕯️', 'wall', 1, 1, 'vela']] },
      { name: 'Armería', items: [['⚔️', 'wall', 2, 3], ['🛡️', 'wall', 1, 3], ['🪔', 'corner', 1, 1, 'lampara']] },
      { name: 'Biblioteca', items: [['📚', 'wall', 3, 5], ['📜', 'center', 1, 1], ['🕯️', 'center', 1, 1, 'vela']] },
      { name: 'Cocina', items: [['🔥', 'wall', 1, 1, 'hoguera'], ['🛢️', 'corner', 1, 2], ['🍖', 'center', 1, 1], ['🧺', 'any', 0, 1]] },
    ],
  },
  sewer: {
    name: 'Alcantarillas',
    icon: '🌊',
    description: 'Canales de agua entre salas de adoquín: cisternas, nidos de ratas y escombros.',
    floor: 'c',
    corridor: 'a',
    minRoom: 3,
    maxRoom: 7,
    density: 1.1,
    torches: 1,
    kinds: [
      { name: 'Nido de ratas', items: [['🦴', 'any', 2, 3], ['🧀', 'any', 0, 1], ['🕸️', 'corner', 1, 1]] },
      { name: 'Cisterna', items: [['🛢️', 'wall', 1, 2], ['🪜', 'corner', 1, 1]] },
      { name: 'Escombros', items: [['🪨', 'any', 2, 4], ['📦', 'corner', 0, 1]] },
      { name: 'Escondite', items: [['📦', 'corner', 1, 2], ['🛏️', 'wall', 1, 1], ['💰', 'any', 0, 1]] },
    ],
  },
  mine: {
    name: 'Mina',
    icon: '⛏️',
    description: 'Galerías de tierra entre cámaras de roca con vetas, vagonetas y derrumbes.',
    floor: 'o',
    corridor: 'd',
    minRoom: 3,
    maxRoom: 8,
    density: 1,
    torches: 1,
    kinds: [
      { name: 'Veta', items: [['💎', 'wall', 1, 3], ['🪨', 'any', 1, 2], ['⛏️', 'any', 0, 1]] },
      { name: 'Almacén de la mina', items: [['📦', 'corner', 1, 3], ['🛢️', 'wall', 1, 2], ['🪵', 'wall', 1, 2]] },
      { name: 'Derrumbe', items: [['🪨', 'any', 3, 5]] },
      { name: 'Campamento minero', items: [['🔥', 'center', 1, 1, 'hoguera'], ['🛏️', 'wall', 1, 2], ['🍖', 'any', 0, 1]] },
    ],
  },
  cave: {
    name: 'Cueva',
    icon: '🕳️',
    description: 'Cueva natural rodeada de roca, con rocas, setas, huesos y telarañas.',
    floor: 'o',
    corridor: 'o',
    minRoom: 3,
    maxRoom: 9,
    density: 1,
    torches: 0,
    kinds: [],
  },
};

/** Lo que coloca el generador: un objeto (emoji) en una casilla, con su tamaño y luz. */
export interface GeneratedObject {
  emoji: string;
  x: number;
  y: number;
  size: number;
  light: Light | null;
}

export interface StyledMap extends GeneratedMap {
  objects: GeneratedObject[];
  /** Uso de cada sala, en el mismo orden que `rooms` (para enseñarlo al DM si se quiere). */
  roomKinds: string[];
}

/** Casillas a los dos lados de cada puerta: ahí no se pone nada para no tapar el paso. */
function doorCells(map: GeneratedMap): Set<number> {
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
 * Amuebla las salas de una mazmorra: a cada una le da un uso del estilo y coloca sus objetos en
 * esquinas, junto a las paredes o en el centro, sin tapar entradas ni puertas.
 */
export function furnishRooms(map: GeneratedMap, w: number, h: number, style: MapStyle, rnd: () => number): { objects: GeneratedObject[]; roomKinds: string[] } {
  const def = MAP_STYLE_DEFS[style];
  const rooms = map.rooms ?? [];
  const objects: GeneratedObject[] = [];
  const roomKinds: string[] = [];
  if (!def.kinds.length) return { objects, roomKinds };
  const t = map.terrain;
  const inRoom = (r: CellRect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || isSolidCell(t[y * w + x]);
  const doors = doorCells(map);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  // Se reparten los usos para que no se repitan hasta haberlos usado todos.
  let bag: RoomKind[] = [];

  for (const r of rooms) {
    if (!bag.length) bag = [...def.kinds].sort(() => rnd() - 0.5);
    const kind = bag.pop()!;
    roomKinds.push(kind.name);
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
    const items = def.torches ? [...kind.items, TORCH] : kind.items;
    for (const [emoji, where, min, max, light] of items) {
      const n = int(min, max);
      for (let i = 0; i < n; i++) place(emoji, where, light);
    }
  }
  return { objects, roomKinds };
}

/** Cueva: rocas, setas, huesos y telarañas repartidos por el suelo (más cerca de las paredes). */
export function furnishCave(map: GeneratedMap, w: number, h: number, rnd: () => number): GeneratedObject[] {
  const t = map.terrain;
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || isSolidCell(t[y * w + x]);
  const floor: { x: number; y: number; walls: number }[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      floor.push({ x, y, walls: [solid(x + 1, y), solid(x - 1, y), solid(x, y + 1), solid(x, y - 1)].filter(Boolean).length });
    }
  const objects: GeneratedObject[] = [];
  const used = new Set<string>();
  const pick = (nearWall: boolean) => {
    const options = floor.filter((c) => !used.has(`${c.x},${c.y}`) && (!nearWall || c.walls > 0));
    return options.length ? options[Math.floor(rnd() * options.length)]! : null;
  };
  const count = Math.round(floor.length / 18);
  const kinds: [string, boolean][] = [
    ['🪨', true],
    ['🪨', true],
    ['🍄', true],
    ['🦴', false],
    ['🕸️', true],
    ['💀', false],
  ];
  for (let i = 0; i < count; i++) {
    const [emoji, nearWall] = kinds[Math.floor(rnd() * kinds.length)]!;
    const c = pick(nearWall);
    if (!c) break;
    used.add(`${c.x},${c.y}`);
    objects.push({ emoji, x: c.x, y: c.y, size: 1, light: null });
  }
  return objects;
}

/** Genera un mapa del estilo pedido; con `furnish`, amueblado. */
export function generateStyled(w: number, h: number, opts: { seed: number; style: MapStyle; size?: MapSize; furnish?: boolean }): StyledMap {
  const def = MAP_STYLE_DEFS[opts.style];
  const factor = opts.size === 'few' ? 0.6 : opts.size === 'many' ? 1.5 : 1;
  const map =
    opts.style === 'cave'
      ? generateCave(w, h, { seed: opts.seed, floor: def.floor, fill: opts.size === 'few' ? 0.5 : opts.size === 'many' ? 0.4 : 0.45 })
      : generateDungeon(w, h, {
          seed: opts.seed,
          floor: def.floor,
          corridor: def.corridor,
          minRoom: def.minRoom,
          maxRoom: def.maxRoom,
          rooms: Math.max(2, Math.round(((w * h) / 90) * def.density * factor)),
        });
  if (opts.furnish === false) return { ...map, objects: [], roomKinds: [] };
  // Otra semilla para los muebles, para que cambiar de amueblado no cambie el plano.
  const rnd = seededRng(opts.seed ^ 0x5f3759df);
  if (opts.style === 'cave') return { ...map, objects: furnishCave(map, w, h, rnd), roomKinds: [] };
  return { ...map, ...furnishRooms(map, w, h, opts.style, rnd) };
}
