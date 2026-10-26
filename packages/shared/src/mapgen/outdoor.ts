import { seededRng, type CellRect, type GeneratedMap } from '../schemas/terrain.js';
import { PREFAB_LIGHTS } from './prefabs.js';
import { furnishRoomKinds, type GeneratedObject, type RoomKind } from './furnish.js';

/**
 * Mapas de exterior: bosque, camino y pueblo. Todo el mapa es suelo (hierba, tierra, agua…), así
 * que no salen paredes alrededor; las casas del pueblo traen sus propias paredes y puertas.
 * Los árboles son objetos (los justos: el suelo «Bosque» ya pinta las copas).
 */

type Size = 'few' | 'normal' | 'many';
interface Opts {
  seed: number;
  size?: Size;
  furnish?: boolean;
}

export interface OutdoorMap extends GeneratedMap {
  objects: GeneratedObject[];
  roomKinds: string[];
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Manchas al azar (autómata celular sobre ruido): true donde hay mancha. */
function blobs(w: number, h: number, rnd: () => number, fill: number, steps = 4): boolean[] {
  let on = Array.from({ length: w * h }, () => rnd() < fill);
  for (let s = 0; s < steps; s++) {
    on = on.map((_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          // Fuera del mapa cuenta como lo de dentro más cercano (así las manchas llegan al borde).
          const cx = Math.max(0, Math.min(w - 1, nx));
          const cy = Math.max(0, Math.min(h - 1, ny));
          if (on[cy * w + cx]) n++;
        }
      return n >= 5;
    });
  }
  return on;
}

/**
 * Senda que cruza el mapa de un borde al opuesto haciendo curvas: casillas (índices) que ocupa.
 * `across`: de izquierda a derecha (si no, de arriba abajo). Sin huecos en diagonal.
 */
function windingPath(w: number, h: number, rnd: () => number, opts: { across: boolean; width: number; wiggle: number; at?: number }): Set<number> {
  const len = opts.across ? w : h;
  const side = opts.across ? h : w;
  const margin = Math.min(3, Math.floor((side - opts.width) / 2));
  const lo = margin;
  const hi = side - opts.width - margin;
  let pos = Math.max(lo, Math.min(hi, opts.at ?? lo + Math.floor(rnd() * (hi - lo + 1))));
  const out = new Set<number>();
  const mark = (along: number, p: number) => {
    for (let k = 0; k < opts.width; k++) {
      const [x, y] = opts.across ? [along, p + k] : [p + k, along];
      if (x >= 0 && y >= 0 && x < w && y < h) out.add(y * w + x);
    }
  };
  // Tiende a seguir torciendo hacia el mismo lado un rato (curvas suaves en vez de zigzag).
  let dir = rnd() < 0.5 ? -1 : 1;
  for (let a = 0; a < len; a++) {
    mark(a, pos);
    if (rnd() < 0.2) dir = -dir;
    if (rnd() < opts.wiggle) {
      if (pos + dir < lo || pos + dir > hi) dir = -dir;
      const next = Math.max(lo, Math.min(hi, pos + dir));
      // La casilla del cambio también, para que no quede un paso en diagonal.
      mark(a, next);
      pos = next;
    }
  }
  return out;
}

/** Casillas a menos de `r` (con algo de irregularidad) de un punto. */
function disc(w: number, h: number, cx: number, cy: number, r: number, rnd: () => number): number[] {
  const out: number[] = [];
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (Math.hypot(x - cx, y - cy) <= r + (rnd() - 0.5) * 0.9) out.push(y * w + x);
    }
  return out;
}

/** Va apuntando objetos sin repetir casilla, con un tope para no cargar el tablero (la Raspberry lo agradece). */
function objectList(w: number, max: number) {
  const objects: GeneratedObject[] = [];
  const used = new Set<number>();
  return {
    objects,
    used,
    full: () => objects.length >= max,
    add(i: number, emoji: string, light: GeneratedObject['light'] = null) {
      if (used.has(i) || objects.length >= max) return false;
      used.add(i);
      objects.push({ emoji, x: i % w, y: Math.floor(i / w), size: 1, light });
      return true;
    },
  };
}

/** Árboles: más en el borde de las arboledas (donde se ven) y alguno suelto en la hierba. */
function plantTrees(t: string[], w: number, h: number, rnd: () => number, list: ReturnType<typeof objectList>, avoid: Set<number>) {
  const forest = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || t[y * w + x] === 'f';
  const order = Array.from({ length: w * h }, (_, i) => i).sort(() => rnd() - 0.5);
  for (const i of order) {
    if (list.full()) break;
    if (avoid.has(i)) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    const kind = t[i];
    let chance = 0;
    if (kind === 'f') chance = DIRS.some(([dx, dy]) => !forest(x + dx, y + dy)) ? 0.45 : 0.08;
    else if (kind === 'g') chance = 0.02;
    if (rnd() < chance) list.add(i, rnd() < 0.55 ? '🌲' : '🌳');
  }
}

/** Unas pocas rocas, setas y matas por la hierba y la arboleda. */
function scatterBits(t: string[], rnd: () => number, list: ReturnType<typeof objectList>, avoid: Set<number>, bits: [string, number][]) {
  for (let i = 0; i < t.length && !list.full(); i++) {
    if (avoid.has(i) || (t[i] !== 'g' && t[i] !== 'f')) continue;
    for (const [emoji, chance] of bits) if (rnd() < chance && list.add(i, emoji)) break;
  }
}

const fillOf = (size: Size | undefined, few: number, normal: number, many: number) => (size === 'few' ? few : size === 'many' ? many : normal);
const maxObjects = (w: number, h: number) => Math.max(30, Math.min(160, Math.round((w * h) / 10)));

/** Bosque: arboledas, una senda que lo cruza, un claro junto a ella y quizá una charca. */
export function generateForest(w: number, h: number, opts: Opts): OutdoorMap {
  const rnd = seededRng(opts.seed);
  const t: string[] = Array(w * h).fill('g');
  blobs(w, h, rnd, fillOf(opts.size, 0.4, 0.48, 0.56)).forEach((on, i) => on && (t[i] = 'f'));

  // Charca.
  const water = new Set<number>();
  if (Math.min(w, h) >= 12 && rnd() < 0.6) {
    const r = Math.max(1.5, Math.min(w, h) / 10);
    for (const i of disc(w, h, r + 2 + rnd() * (w - 2 * r - 4), r + 2 + rnd() * (h - 2 * r - 4), r, rnd)) water.add(i);
  }
  water.forEach((i) => (t[i] = 'a'));

  // Senda (con pasarela de madera si cruza la charca).
  const across = w >= h ? true : rnd() < 0.3;
  const path = windingPath(w, h, rnd, { across, width: Math.min(w, h) >= 30 ? 2 : 1, wiggle: 0.25 });
  path.forEach((i) => (t[i] = water.has(i) ? 'w' : 'd'));

  // Claro junto a la senda, hacia la mitad del mapa.
  const near = [...path].filter((i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    return across ? Math.abs(x - w / 2) < w / 4 : Math.abs(y - h / 2) < h / 4;
  });
  const anchor = near.length ? near[Math.floor(rnd() * near.length)]! : [...path][0]!;
  const r = Math.max(2, Math.min(3.5, Math.min(w, h) / 7));
  const off = (r + 1) * (rnd() < 0.5 ? -1 : 1);
  const cx = Math.max(r + 1, Math.min(w - r - 2, (anchor % w) + (across ? 0 : off)));
  const cy = Math.max(r + 1, Math.min(h - r - 2, Math.floor(anchor / w) + (across ? off : 0)));
  const clearing = disc(w, h, cx, cy, r, rnd).filter((i) => !path.has(i) && !water.has(i));
  clearing.forEach((i) => (t[i] = 'g'));

  const terrain = t.join('');
  if (opts.furnish === false) return { terrain, doors: [], objects: [], roomKinds: [] };

  const list = objectList(w, maxObjects(w, h));
  // Centro del claro: su casilla más cercana al centro (el centro puede haber caído en la senda).
  const center = [...clearing].sort((a, b) => Math.hypot((a % w) - cx, Math.floor(a / w) - cy) - Math.hypot((b % w) - cx, Math.floor(b / w) - cy))[0] ?? -1;
  const ring = (n: number, emoji: string) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.4;
      const x = Math.round(cx + Math.cos(a) * Math.min(2, r - 0.5));
      const y = Math.round(cy + Math.sin(a) * Math.min(2, r - 0.5));
      const i = y * w + x;
      if (clearing.includes(i)) list.add(i, emoji);
    }
  };
  const what = center < 0 ? 1 : rnd();
  if (what < 0.45) {
    // Campamento: hoguera, tiendas y troncos para sentarse.
    list.add(center, '🔥', PREFAB_LIGHTS.hoguera);
    ring(2, '⛺');
    ring(3, '🪵');
  } else if (what < 0.75) {
    // Ruinas: un círculo de piedras alrededor de una estatua.
    list.add(center, '🗿');
    ring(6, '🪨');
  }
  const avoid = new Set<number>([...path, ...water, ...clearing]);
  plantTrees(t, w, h, rnd, list, avoid);
  scatterBits(t, rnd, list, avoid, [
    ['🍄', 0.012],
    ['🪨', 0.01],
    ['🌿', 0.012],
  ]);
  return { terrain, doors: [], objects: list.objects, roomKinds: [] };
}

/** Camino: cruza el mapa entre arboledas; a veces lo corta un río con su puente. En medio, un carro volcado. */
export function generateRoad(w: number, h: number, opts: Opts): OutdoorMap {
  const rnd = seededRng(opts.seed);
  const t: string[] = Array(w * h).fill('g');
  blobs(w, h, rnd, fillOf(opts.size, 0.3, 0.42, 0.52)).forEach((on, i) => on && (t[i] = 'f'));
  const across = w >= h;

  // Río en la otra dirección.
  const river = new Set<number>();
  if (Math.min(w, h) >= 14 && rnd() < 0.65) {
    const len = across ? w : h;
    const at = Math.round(len * (0.25 + rnd() * 0.5));
    for (const i of windingPath(w, h, rnd, { across: !across, width: len >= 30 ? 3 : 2, wiggle: 0.3, at })) river.add(i);
  }
  river.forEach((i) => (t[i] = 'a'));

  const road = windingPath(w, h, rnd, { across, width: 2, wiggle: 0.25 });
  // Arcén: sin arboleda junto al camino.
  for (const i of road)
    for (const [dx, dy] of DIRS) {
      const x = (i % w) + dx;
      const y = Math.floor(i / w) + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && t[y * w + x] === 'f') t[y * w + x] = 'g';
    }
  road.forEach((i) => (t[i] = river.has(i) ? 'w' : 'd'));

  const terrain = t.join('');
  if (opts.furnish === false) return { terrain, doors: [], objects: [], roomKinds: [] };

  const list = objectList(w, maxObjects(w, h));
  // Carro volcado hacia la mitad del camino (lejos del puente), con su carga desparramada.
  const middle = [...road].filter((i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    const nearRiver = DIRS.some(([dx, dy]) => river.has((y + dy * 2) * w + x + dx * 2)) || river.has(i);
    return !nearRiver && (across ? Math.abs(x - w / 2) < w / 5 : Math.abs(y - h / 2) < h / 5);
  });
  if (middle.length) {
    const c = middle[Math.floor(rnd() * middle.length)]!;
    list.add(c, '🛢️');
    const step = across ? 1 : w;
    list.add(c + step, '📦');
    list.add(c - step, '📦');
    // El caballo, en la hierba de al lado.
    const side = across ? w : 1;
    for (const i of [c + side * 2, c - side * 2, c + side * 3]) if (!road.has(i) && t[i] === 'g' && list.add(i, '🐎')) break;
  }
  // Un cartel al principio del camino.
  const start = [...road].find((i) => (across ? i % w === 2 : Math.floor(i / w) === 2));
  if (start !== undefined) {
    const side = across ? -w : -1;
    if (t[start + side] === 'g') list.add(start + side, '🪧');
  }
  const avoid = new Set<number>([...road, ...river]);
  plantTrees(t, w, h, rnd, list, avoid);
  scatterBits(t, rnd, list, avoid, [
    ['🪨', 0.012],
    ['🌿', 0.01],
  ]);
  return { terrain, doors: [], objects: list.objects, roomKinds: [] };
}

/** Usos de las casas del pueblo. */
const HOUSES: Record<'tavern' | 'shop' | 'smithy' | 'temple' | 'stable' | 'home', RoomKind> = {
  tavern: { name: 'Taberna', items: [['🍺', 'wall', 2, 2], ['🍖', 'center', 1, 2], ['🪑', 'center', 2, 3], ['🛢️', 'corner', 1, 2], ['🪔', 'wall', 1, 1, 'lampara']] },
  shop: { name: 'Tienda', items: [['📦', 'corner', 2, 2], ['🛢️', 'wall', 1, 1], ['🗄️', 'wall', 1, 1], ['💰', 'center', 0, 1], ['🕯️', 'wall', 1, 1, 'vela']] },
  smithy: { name: 'Herrería', items: [['🔥', 'wall', 1, 1, 'hoguera'], ['⚔️', 'wall', 1, 2], ['🛡️', 'wall', 0, 1], ['🧰', 'corner', 1, 1]] },
  temple: { name: 'Templo', items: [['🗿', 'wall', 1, 1], ['🕯️', 'wall', 2, 2, 'vela'], ['🪑', 'center', 2, 3], ['📜', 'corner', 0, 1]] },
  stable: { name: 'Establo', items: [['🐎', 'any', 1, 2], ['🌾', 'corner', 2, 3], ['🛢️', 'wall', 0, 1]] },
  home: { name: 'Casa', items: [['🛏️', 'wall', 1, 2], ['🪑', 'center', 1, 1], ['🧰', 'corner', 0, 1], ['🕯️', 'wall', 0, 1, 'vela']] },
};

/**
 * Pueblo: una calle principal (y otra que la cruza si cabe) con una plaza empedrada en el cruce, y casas
 * de madera junto a las calles, cada una con sus paredes, una puerta hacia la calle y su uso
 * (la más cercana a la plaza es la taberna; luego tienda, herrería, templo, establo y viviendas).
 */
export function generateVillage(w: number, h: number, opts: Opts): OutdoorMap {
  const rnd = seededRng(opts.seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const t: string[] = Array(w * h).fill('g');
  const across = w >= h;
  const streets = windingPath(w, h, rnd, { across, width: 2, wiggle: 0.12 });
  if (Math.min(w, h) >= 16) {
    const len = across ? w : h;
    for (const i of windingPath(w, h, rnd, { across: !across, width: 2, wiggle: 0.12, at: Math.round(len * (0.35 + rnd() * 0.3)) })) streets.add(i);
  }
  streets.forEach((i) => (t[i] = 'd'));

  // Plaza en el cruce (o en medio de la calle si solo hay una).
  const centre = [...streets].sort((a, b) => Math.hypot((a % w) - w / 2, Math.floor(a / w) - h / 2) - Math.hypot((b % w) - w / 2, Math.floor(b / w) - h / 2))[0]!;
  const side = Math.max(4, Math.min(8, Math.round(Math.min(w, h) / 5)));
  const px = Math.max(1, Math.min(w - side - 1, (centre % w) - Math.floor(side / 2)));
  const py = Math.max(1, Math.min(h - side - 1, Math.floor(centre / w) - Math.floor(side / 2)));
  const plaza: CellRect = { x: px, y: py, w: side, h: side };
  for (let y = py; y < py + side; y++) for (let x = px; x < px + side; x++) t[y * w + x] = 'c';

  // Distancia de cada casilla a la calle o la plaza (para poner las casas cerca y la puerta hacia ella).
  const dist = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  t.forEach((c, i) => {
    if (c !== 'g') {
      dist[i] = 0;
      queue.push(i);
    }
  });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const [dx, dy] of DIRS) {
      const x = (i % w) + dx;
      const y = Math.floor(i / w) + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || dist[y * w + x]! >= 0) continue;
      dist[y * w + x] = dist[i]! + 1;
      queue.push(y * w + x);
    }
  }

  // Casas: rectángulos de hierba con una casilla libre alrededor y a no más de 3 de la calle.
  const target = Math.max(2, Math.round((w * h) / fillOf(opts.size, 110, 70, 48)));
  const houses: CellRect[] = [];
  const taken = new Uint8Array(w * h);
  for (let tries = 0; tries < target * 60 && houses.length < target; tries++) {
    const r = { x: 0, y: 0, w: int(3, 6), h: int(3, 5) };
    if (r.w + 2 > w || r.h + 2 > h) break;
    r.x = int(1, w - r.w - 1);
    r.y = int(1, h - r.h - 1);
    let ok = true;
    let near = false;
    for (let y = r.y - 1; y <= r.y + r.h && ok; y++)
      for (let x = r.x - 1; x <= r.x + r.w && ok; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (t[y * w + x] !== 'g' || taken[y * w + x]) ok = false;
        if (dist[y * w + x]! <= 2) near = true;
      }
    if (!ok || !near) continue;
    houses.push(r);
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (x >= 0 && y >= 0 && x < w && y < h) taken[y * w + x] = 1;
  }

  // Suelo, puerta (en el lado más cercano a la calle, nunca en una esquina si cabe) y paredes.
  const doors: GeneratedMap['doors'] = [];
  const walls: NonNullable<GeneratedMap['walls']> = [];
  for (const r of houses) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) t[y * w + x] = 'w';
    type Door = GeneratedMap['doors'][number];
    const best: { d: number; door: Door | null } = { d: Infinity, door: null };
    const consider = (outside: number, door: Door) => {
      const d = dist[outside] ?? -1;
      if (d >= 0 && (d < best.d || (d === best.d && rnd() < 0.3))) Object.assign(best, { d, door });
    };
    for (let x = r.x + (r.w > 2 ? 1 : 0); x < r.x + r.w - (r.w > 2 ? 1 : 0); x++) {
      if (r.y > 0) consider((r.y - 1) * w + x, { x1: x, y1: r.y, x2: x + 1, y2: r.y });
      if (r.y + r.h < h) consider((r.y + r.h) * w + x, { x1: x, y1: r.y + r.h, x2: x + 1, y2: r.y + r.h });
    }
    for (let y = r.y + (r.h > 2 ? 1 : 0); y < r.y + r.h - (r.h > 2 ? 1 : 0); y++) {
      if (r.x > 0) consider(y * w + r.x - 1, { x1: r.x, y1: y, x2: r.x, y2: y + 1 });
      if (r.x + r.w < w) consider(y * w + r.x + r.w, { x1: r.x + r.w, y1: y, x2: r.x + r.w, y2: y + 1 });
    }
    const door = best.door;
    if (door) doors.push(door);
    // Cada lado de la casa es una pared, partida en dos donde está la puerta.
    const sides = [
      { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
      { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h },
      { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h },
      { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h },
    ];
    for (const s of sides) {
      const onSide = door && (s.y1 === s.y2 ? door.y1 === door.y2 && door.y1 === s.y1 : door.x1 === door.x2 && door.x1 === s.x1);
      if (!onSide) walls.push(s);
      else if (s.y1 === s.y2) {
        if (door.x1 > s.x1) walls.push({ ...s, x2: door.x1 });
        if (door.x2 < s.x2) walls.push({ ...s, x1: door.x2 });
      } else {
        if (door.y1 > s.y1) walls.push({ ...s, y2: door.y1 });
        if (door.y2 < s.y2) walls.push({ ...s, y1: door.y2 });
      }
    }
  }

  const terrain = t.join('');
  const map: GeneratedMap = { terrain, doors, walls, rooms: houses };
  if (opts.furnish === false) return { ...map, objects: [], roomKinds: [] };

  // Usos: por cercanía a la plaza.
  const pcx = plaza.x + plaza.w / 2;
  const pcy = plaza.y + plaza.h / 2;
  const rank = houses.map((r, n) => ({ n, d: Math.hypot(r.x + r.w / 2 - pcx, r.y + r.h / 2 - pcy), big: r.w * r.h >= 16 }));
  rank.sort((a, b) => a.d - b.d);
  const kindOfHouse = new Map<number, RoomKind>();
  const queueKinds = [HOUSES.tavern, HOUSES.shop, HOUSES.smithy];
  let templeDone = false;
  let stableDone = false;
  for (const { n, big } of rank) {
    let kind = queueKinds.shift();
    if (!kind && big && !templeDone) [kind, templeDone] = [HOUSES.temple, true];
    else if (!kind && !stableDone && rnd() < 0.5) [kind, stableDone] = [HOUSES.stable, true];
    kindOfHouse.set(n, kind ?? HOUSES.home);
  }
  const furnished = furnishRoomKinds(map, w, h, (_, n) => kindOfHouse.get(n)!, rnd, { walled: true });

  const list = objectList(w, furnished.objects.length + maxObjects(w, h) / 2);
  furnished.objects.forEach((o) => list.add(o.y * w + o.x, o.emoji, o.light));
  // La plaza: pozo en medio, farolas en dos esquinas y algún puesto de mercado.
  const at = (x: number, y: number) => y * w + x;
  list.add(at(plaza.x + Math.floor(plaza.w / 2), plaza.y + Math.floor(plaza.h / 2)), '⛲');
  list.add(at(plaza.x, plaza.y), '🪔', PREFAB_LIGHTS.lampara);
  list.add(at(plaza.x + plaza.w - 1, plaza.y + plaza.h - 1), '🪔', PREFAB_LIGHTS.lampara);
  for (let k = int(1, 3); k > 0; k--) {
    const edge = [at(plaza.x + 1 + int(0, plaza.w - 3), plaza.y), at(plaza.x + plaza.w - 1, plaza.y + 1 + int(0, plaza.h - 3))][k % 2]!;
    list.add(edge, '🎪');
  }
  // Árboles y flores en la hierba, lejos de las casas y de las calles.
  const avoid = new Set<number>();
  for (let i = 0; i < w * h; i++) if (t[i] !== 'g' || taken[i] || dist[i]! <= 1) avoid.add(i);
  for (let i = 0; i < w * h && !list.full(); i++) {
    if (avoid.has(i)) continue;
    const roll = rnd();
    if (roll < 0.035) list.add(i, rnd() < 0.5 ? '🌳' : '🌲');
    else if (roll < 0.045) list.add(i, '🌻');
  }
  return { ...map, objects: list.objects, roomKinds: furnished.roomKinds };
}
