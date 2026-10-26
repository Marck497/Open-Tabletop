import { generateCave, generateDungeon, isSolidCell, seededRng, type GeneratedMap } from '../schemas/terrain.js';
import { furnishRoomKinds, type GeneratedObject, type RoomKind } from './furnish.js';
import { generateForest, generateRoad, generateVillage } from './outdoor.js';

/**
 * Generador de mapas con estilos (mazmorra, cripta, castillo, alcantarillas, mina, cueva, y de
 * exterior: bosque, camino y pueblo) y amueblado: a cada sala le toca un uso (almacén, cuartel,
 * tumbas…) y se llena con sus objetos y alguna antorcha. Todo con semilla: la misma semilla da el mismo mapa.
 */

export const MAP_STYLES = ['dungeon', 'crypt', 'castle', 'sewer', 'mine', 'cave', 'forest', 'road', 'village'] as const;
export type MapStyle = (typeof MAP_STYLES)[number];

export const MAP_SIZES = ['few', 'normal', 'many'] as const;
export type MapSize = (typeof MAP_SIZES)[number];
export const MAP_SIZE_LABELS: Record<MapSize, string> = { few: 'Pocas salas', normal: 'Normal', many: 'Muchas salas' };

interface StyleDef {
  name: string;
  /** De exterior: todo es suelo (no hay paredes alrededor). */
  outdoor?: boolean;
  /** Qué significa el tamaño en este estilo (si no, «Pocas salas / Normal / Muchas salas»). */
  sizeLabels?: Record<MapSize, string>;
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
    sizeLabels: { few: 'Más roca', normal: 'Normal', many: 'Más abierta' },
  },
  forest: {
    name: 'Bosque',
    icon: '🌲',
    description: 'Arboleda con una senda, un claro (a veces con un campamento o unas ruinas) y quizá una charca.',
    outdoor: true,
    floor: 'g',
    corridor: 'd',
    minRoom: 0,
    maxRoom: 0,
    density: 0,
    torches: 0,
    kinds: [],
    sizeLabels: { few: 'Poco espeso', normal: 'Normal', many: 'Muy espeso' },
  },
  road: {
    name: 'Camino',
    icon: '🛤️',
    description: 'Un camino entre arboledas, a veces con un río y su puente, y un carro volcado: perfecto para una emboscada.',
    outdoor: true,
    floor: 'g',
    corridor: 'd',
    minRoom: 0,
    maxRoom: 0,
    density: 0,
    torches: 0,
    kinds: [],
    sizeLabels: { few: 'Despejado', normal: 'Normal', many: 'Boscoso' },
  },
  village: {
    name: 'Pueblo',
    icon: '🏘️',
    description: 'Calles de tierra, una plaza con pozo y casas con sus paredes y puertas: taberna, tienda, herrería, templo, establo y viviendas.',
    outdoor: true,
    floor: 'g',
    corridor: 'd',
    minRoom: 3,
    maxRoom: 6,
    density: 0,
    torches: 0,
    kinds: [],
    sizeLabels: { few: 'Aldea', normal: 'Pueblo', many: 'Muchas casas' },
  },
};

/** Lo que significa cada tamaño en un estilo. */
export const mapSizeLabel = (style: MapStyle, size: MapSize) => MAP_STYLE_DEFS[style].sizeLabels?.[size] ?? MAP_SIZE_LABELS[size];

export type { GeneratedObject };

export interface StyledMap extends GeneratedMap {
  objects: GeneratedObject[];
  /** Uso de cada sala, en el mismo orden que `rooms` (para enseñarlo al DM si se quiere). */
  roomKinds: string[];
}

/**
 * Amuebla las salas de una mazmorra: a cada una le da un uso del estilo (sin repetir hasta haberlos
 * usado todos) y coloca sus objetos en esquinas, junto a las paredes o en el centro, sin tapar entradas ni puertas.
 */
export function furnishRooms(map: GeneratedMap, w: number, h: number, style: MapStyle, rnd: () => number): { objects: GeneratedObject[]; roomKinds: string[] } {
  const def = MAP_STYLE_DEFS[style];
  if (!def.kinds.length) return { objects: [], roomKinds: [] };
  let bag: RoomKind[] = [];
  const kindOf = () => {
    if (!bag.length) bag = [...def.kinds].sort(() => rnd() - 0.5);
    return bag.pop()!;
  };
  return furnishRoomKinds(map, w, h, kindOf, rnd, { torches: def.torches > 0 });
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
  if (opts.style === 'forest') return generateForest(w, h, opts);
  if (opts.style === 'road') return generateRoad(w, h, opts);
  if (opts.style === 'village') return generateVillage(w, h, opts);
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
