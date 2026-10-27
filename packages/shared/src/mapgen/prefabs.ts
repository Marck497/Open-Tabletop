import type { Light } from '../schemas/lights.js';
import { normalizeTerrain, TERRAIN_EMPTY } from '../schemas/terrain.js';
import { tr } from '../i18n/index.js';

/**
 * Salas prediseñadas para el editor de mapas: un plano pequeño con su suelo, puertas y objetos
 * que el DM coloca con un clic y luego retoca. El plano es una lista de filas con un carácter
 * por casilla (los códigos de terreno de terrain.ts); '.' deja la casilla como esté.
 */

/** Luces de los objetos (distancias en pies, como en 5e). */
export const PREFAB_LIGHTS = {
  vela: { bright: 5, dim: 5, color: '#ffcc80' },
  antorcha: { bright: 20, dim: 20, color: '#ffb74d' },
  lampara: { bright: 15, dim: 30, color: '#ffd180' },
  hoguera: { bright: 20, dim: 20, color: '#ff9e40' },
  magia: { bright: 10, dim: 10, color: '#b39ddb' },
} satisfies Record<string, Light>;
export type PrefabLight = keyof typeof PREFAB_LIGHTS;

/** Lado de una casilla: arriba, abajo, izquierda o derecha. */
export type CellSide = 'n' | 's' | 'w' | 'e';

/** Objeto: emoji, casilla (x, y) de su esquina, tamaño en casillas y la luz que da. */
export type PrefabObject = [emoji: string, x: number, y: number, size?: number, light?: PrefabLight];
/** Puerta en un lado de una casilla; con `locked`, empieza cerrada con llave. */
export type PrefabDoor = [x: number, y: number, side: CellSide, locked?: boolean];

export const PREFAB_GROUPS = [tr('Pueblo'), tr('Castillo y templo'), tr('Mazmorra'), tr('Exterior')] as const;
export type PrefabGroup = (typeof PREFAB_GROUPS)[number];

export interface Prefab {
  id: string;
  name: string;
  icon: string;
  group: PrefabGroup;
  description: string;
  rows: string[];
  doors: PrefabDoor[];
  objects: PrefabObject[];
  /** De exterior: no se le ponen paredes alrededor (queda mejor sobre hierba o tierra ya pintada). */
  outdoor?: boolean;
}

const fill = (code: string, w: number, h: number) => Array.from({ length: h }, () => code.repeat(w));

export const PREFABS: Prefab[] = [
  {
    id: 'taberna',
    name: tr('Taberna'),
    icon: '🍺',
    group: tr('Pueblo'),
    description: tr('Barra, mesas, barriles, chimenea y escalera al piso de arriba.'),
    rows: fill('w', 12, 8),
    doors: [
      [5, 7, 's'],
      [6, 7, 's'],
    ],
    objects: [
      ['🛢️', 0, 0],
      ['🛢️', 0, 1],
      ['🍺', 2, 1],
      ['🍺', 3, 1],
      ['🍺', 4, 1],
      ['🪔', 6, 0, 1, 'lampara'],
      ['🪜', 11, 0],
      ['🔥', 11, 3, 1, 'hoguera'],
      ['🍖', 2, 4],
      ['🪑', 1, 4],
      ['🍖', 6, 4],
      ['🪑', 7, 4],
      ['🍖', 9, 5],
      ['🪑', 10, 5],
      ['🍖', 3, 6],
      ['🪑', 2, 6],
      ['🍖', 8, 2],
      ['🪑', 9, 2],
    ],
  },
  {
    id: 'tienda',
    name: tr('Tienda'),
    icon: '📦',
    group: tr('Pueblo'),
    description: tr('Estanterías, mostrador con la caja, cajas y una lámpara.'),
    rows: fill('w', 7, 6),
    doors: [[3, 5, 's']],
    objects: [
      ['🗄️', 0, 0],
      ['🗄️', 1, 0],
      ['🗄️', 2, 0],
      ['🪔', 4, 0, 1, 'lampara'],
      ['🧰', 5, 0],
      ['📦', 6, 0],
      ['📦', 6, 1],
      ['⚗️', 2, 2],
      ['💰', 3, 2],
      ['📜', 4, 2],
      ['🏺', 0, 4],
      ['🛢️', 6, 4],
    ],
  },
  {
    id: 'posada',
    name: tr('Habitación de posada'),
    icon: '🛏️',
    group: tr('Pueblo'),
    description: tr('Dos camas, un baúl, una silla y una vela.'),
    rows: fill('w', 5, 5),
    doors: [[2, 4, 's']],
    objects: [
      ['🛏️', 0, 0],
      ['🛏️', 4, 0],
      ['🧰', 0, 2],
      ['🪑', 3, 2],
      ['🕯️', 4, 2, 1, 'vela'],
    ],
  },
  {
    id: 'herreria',
    name: tr('Herrería'),
    icon: '⚒️',
    group: tr('Pueblo'),
    description: tr('Fragua encendida, yunque, armas y barriles de agua.'),
    rows: fill('p', 7, 6),
    doors: [[3, 5, 's']],
    objects: [
      ['🔥', 0, 0, 2, 'hoguera'],
      ['🪨', 3, 1],
      ['⚔️', 6, 0],
      ['⚔️', 6, 1],
      ['🛡️', 6, 2],
      ['🛢️', 0, 4],
      ['🛢️', 0, 5],
      ['🪵', 5, 5],
    ],
  },
  {
    id: 'plaza',
    name: tr('Plaza con fuente'),
    icon: '⛲',
    group: tr('Pueblo'),
    description: tr('Adoquines, fuente en el centro, árboles, bancos y farolas.'),
    rows: ['gcccccccg', ...fill('c', 9, 7), 'gcccccccg'],
    doors: [],
    objects: [
      ['⛲', 3, 3, 3],
      ['🌳', 0, 0],
      ['🌳', 8, 0],
      ['🌳', 0, 8],
      ['🌳', 8, 8],
      ['🪑', 1, 4],
      ['🪑', 7, 4],
      ['🪔', 2, 1, 1, 'lampara'],
      ['🪔', 6, 7, 1, 'lampara'],
      ['🪧', 4, 0],
    ],
    outdoor: true,
  },
  {
    id: 'templo',
    name: tr('Templo'),
    icon: '⛪',
    group: tr('Castillo y templo'),
    description: tr('Nave de mármol con alfombra, bancos, altar con velas y estatua.'),
    rows: [...fill('m', 9, 2), ...fill('mmmmkmmmm', 1, 10)],
    doors: [[4, 11, 's']],
    objects: [
      ['🏺', 0, 0],
      ['🗿', 4, 0],
      ['🏺', 8, 0],
      ['🕯️', 2, 1, 1, 'vela'],
      ['📜', 4, 2],
      ['🕯️', 6, 1, 1, 'vela'],
      ['🪑', 2, 4],
      ['🪑', 6, 4],
      ['🪑', 2, 6],
      ['🪑', 6, 6],
      ['🪑', 2, 8],
      ['🪑', 6, 8],
      ['🪔', 0, 6, 1, 'lampara'],
      ['🪔', 8, 6, 1, 'lampara'],
    ],
  },
  {
    id: 'trono',
    name: tr('Sala del trono'),
    icon: '👑',
    group: tr('Castillo y templo'),
    description: tr('Mármol, alfombra hasta el trono, columnas, estandartes y armaduras.'),
    rows: [
      'mmmmmmmmmmm',
      'mmmmmkmmmmm',
      'mmmmmkmmmmm',
      'mmBmmkmmBmm',
      'mmmmmkmmmmm',
      'mmmmmkmmmmm',
      'mmBmmkmmBmm',
      'mmmmmkmmmmm',
      'mmmmmkmmmmm',
      'mmBmmkmmBmm',
      'mmmmmkmmmmm',
      'mmmmmkmmmmm',
      'mmmmmkmmmmm',
    ],
    doors: [[5, 12, 's']],
    objects: [
      ['🏳️', 0, 0],
      ['🛡️', 3, 0],
      ['👑', 5, 0],
      ['🛡️', 7, 0],
      ['🏳️', 10, 0],
      ['🪔', 1, 1, 1, 'lampara'],
      ['🪔', 9, 1, 1, 'lampara'],
      ['⚔️', 0, 6],
      ['⚔️', 10, 6],
      ['🪔', 1, 11, 1, 'lampara'],
      ['🪔', 9, 11, 1, 'lampara'],
    ],
  },
  {
    id: 'biblioteca',
    name: tr('Biblioteca'),
    icon: '📚',
    group: tr('Castillo y templo'),
    description: tr('Estanterías en las paredes, mesa de lectura con vela y pergaminos.'),
    rows: fill('w', 9, 7),
    doors: [[4, 6, 's']],
    objects: [
      ...Array.from({ length: 9 }, (_, x): PrefabObject => ['📚', x, 0]),
      ['📚', 0, 2],
      ['📚', 0, 3],
      ['📚', 0, 4],
      ['📚', 8, 2],
      ['📚', 8, 3],
      ['📚', 8, 4],
      ['🕯️', 3, 3, 1, 'vela'],
      ['📜', 4, 3],
      ['🪑', 4, 4],
      ['🪔', 7, 6, 1, 'lampara'],
    ],
  },
  {
    id: 'cripta',
    name: tr('Sala funeraria'),
    icon: '⚰️',
    group: tr('Mazmorra'),
    description: tr('Ataúdes entre cuatro columnas, huesos, telarañas y velas.'),
    rows: ['ppppppppp', 'ppppppppp', 'ppBpppBpp', 'ppppppppp', 'ppppppppp', 'ppppppppp', 'ppBpppBpp', 'ppppppppp', 'ppppppppp'],
    doors: [[4, 0, 'n']],
    objects: [
      ['🕸️', 0, 0],
      ['💀', 8, 0],
      ['⚰️', 4, 2],
      ['⚰️', 1, 4],
      ['🕯️', 3, 4, 1, 'vela'],
      ['🕯️', 5, 4, 1, 'vela'],
      ['⚰️', 7, 4],
      ['🦴', 5, 6],
      ['⚰️', 4, 7],
      ['💀', 0, 8],
      ['🕸️', 8, 8],
    ],
  },
  {
    id: 'celdas',
    name: tr('Celdas'),
    icon: '⛓️',
    group: tr('Mazmorra'),
    description: tr('Tres celdas cerradas con llave junto a un pasillo con antorcha.'),
    rows: ['pppBpppBppp', 'pppBpppBppp', 'pppBpppBppp', 'BpBBBpBBBpB', 'ppppppppppp', 'ppppppppppp'],
    doors: [
      [1, 3, 'n', true],
      [5, 3, 'n', true],
      [9, 3, 'n', true],
      [5, 5, 's'],
    ],
    objects: [
      ['⛓️', 0, 0],
      ['💀', 2, 2],
      ['⛓️', 4, 0],
      ['🦴', 6, 1],
      ['⛓️', 8, 0],
      ['🔥', 0, 4, 1, 'antorcha'],
      ['🪑', 9, 5],
      ['🗝️', 10, 5],
    ],
  },
  {
    id: 'altar',
    name: tr('Altar ritual'),
    icon: '🕯️',
    group: tr('Mazmorra'),
    description: tr('Cueva redonda con un altar, un círculo de velas mágicas y calaveras.'),
    rows: ['..ooooo..', '.ooooooo.', 'ooooooooo', 'ooooooooo', 'ooooooooo', 'ooooooooo', 'ooooooooo', '.ooooooo.', '..ooooo..'],
    doors: [[4, 8, 's']],
    objects: [
      ['🗿', 4, 1],
      ['🕯️', 2, 2, 1, 'magia'],
      ['🕯️', 6, 2, 1, 'magia'],
      ['💀', 1, 4],
      ['💎', 4, 4],
      ['💀', 7, 4],
      ['🕯️', 2, 6, 1, 'magia'],
      ['🕯️', 6, 6, 1, 'magia'],
    ],
  },
  {
    id: 'campamento',
    name: tr('Campamento'),
    icon: '⛺',
    group: tr('Exterior'),
    description: tr('Claro de tierra con tiendas, hoguera, troncos para sentarse y un caballo.'),
    rows: ['ggggggggg', 'gggdddggg', 'ggdddddgg', 'gdddddddg', 'gdddddddg', 'gdddddddg', 'ggdddddgg', 'gggdddggg', 'ggggggggg'],
    doors: [],
    objects: [
      ['⛺', 1, 1, 2],
      ['⛺', 6, 1, 2],
      ['🪵', 4, 3],
      ['🪵', 3, 4],
      ['🔥', 4, 4, 1, 'hoguera'],
      ['🪵', 5, 4],
      ['⛺', 1, 6, 2],
      ['📦', 6, 6],
      ['🐎', 7, 7],
      ['🌲', 8, 4],
    ],
    outdoor: true,
  },
];

export const prefabById = (id: string) => PREFABS.find((p) => p.id === id);

// ---------- Girar y colocar ----------

/** Una sala ya girada y lista para colocar: puertas como segmentos en casillas y objetos con su luz. */
export interface PlacedPrefab {
  w: number;
  h: number;
  rows: string[];
  doors: { x1: number; y1: number; x2: number; y2: number; locked: boolean }[];
  objects: { emoji: string; x: number; y: number; size: number; light: Light | null }[];
}

function doorSegment([x, y, side]: PrefabDoor) {
  switch (side) {
    case 'n':
      return { x1: x, y1: y, x2: x + 1, y2: y };
    case 's':
      return { x1: x, y1: y + 1, x2: x + 1, y2: y + 1 };
    case 'w':
      return { x1: x, y1: y, x2: x, y2: y + 1 };
    case 'e':
      return { x1: x + 1, y1: y, x2: x + 1, y2: y + 1 };
  }
}

/** Gira la sala `turns` cuartos de vuelta en el sentido de las agujas del reloj. */
export function rotatePrefab(p: Prefab, turns: number): PlacedPrefab {
  let rows = p.rows;
  let w = rows[0]?.length ?? 0;
  let h = rows.length;
  let doors = p.doors.map((d) => ({ ...doorSegment(d), locked: !!d[3] }));
  let objects = p.objects.map(([emoji, x, y, size = 1, light]) => ({ emoji, x, y, size, light: light ? PREFAB_LIGHTS[light] : null }));
  for (let t = 0; t < (((turns % 4) + 4) % 4); t++) {
    // Casilla (x, y) → (h - 1 - y, x); punto de esquina (px, py) → (h - py, px).
    rows = Array.from({ length: w }, (_, ny) => Array.from({ length: h }, (_, nx) => rows[h - 1 - nx]![ny]).join(''));
    doors = doors.map((d) => ({ x1: h - d.y1, y1: d.x1, x2: h - d.y2, y2: d.x2, locked: d.locked }));
    objects = objects.map((o) => ({ ...o, x: h - o.y - o.size, y: o.x }));
    [w, h] = [h, w];
  }
  return { w, h, rows, doors, objects };
}

/**
 * Esquina donde va la sala para que la casilla (cx, cy) quede en su centro, sin salirse de la escena.
 * Devuelve null si la sala no cabe.
 */
export function fitPrefab(p: Pick<PlacedPrefab, 'w' | 'h'>, sceneW: number, sceneH: number, cx: number, cy: number): { x: number; y: number } | null {
  if (p.w > sceneW || p.h > sceneH) return null;
  const x = Math.max(0, Math.min(sceneW - p.w, cx - Math.floor(p.w / 2)));
  const y = Math.max(0, Math.min(sceneH - p.h, cy - Math.floor(p.h / 2)));
  return { x, y };
}

/** Pinta el suelo de la sala con su esquina en (x0, y0); las casillas '.' del plano no se tocan. */
export function paintPrefab(terrain: string, sceneW: number, sceneH: number, p: PlacedPrefab, x0: number, y0: number): string {
  const cells = normalizeTerrain(terrain, sceneW, sceneH).split('');
  p.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const code = row[x]!;
      const sx = x0 + x;
      const sy = y0 + y;
      if (code === TERRAIN_EMPTY || sx < 0 || sy < 0 || sx >= sceneW || sy >= sceneH) continue;
      cells[sy * sceneW + sx] = code;
    }
  });
  return cells.join('');
}
