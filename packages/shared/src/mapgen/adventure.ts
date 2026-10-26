import { z } from 'zod';
import { monsterById } from '../compendium/monsters.js';
import { isSolidCell, seededRng, type CellRect } from '../schemas/terrain.js';
import type { TriggerInput } from '../schemas/triggers.js';
import { DIFFICULTY_LABELS, rateEncounter, suggestEncounter, type Difficulty } from '../systems/encounters.js';
import { generateStyled, MAP_SIZES, MAP_STYLES, type MapStyle, type StyledMap } from './generator.js';

/**
 * Asistente de aventura rápida: a partir del estilo, el tamaño y el grupo, prepara una escena entera
 * lista para jugar: el mapa amueblado, una nota numerada en cada sala (con lo que hay), encuentros
 * escondidos que aparecen al entrar, trampas y un tesoro al final. Aquí solo se planifica (con semilla);
 * el servidor lo crea.
 */

export const ADVENTURE_SIZES = ['small', 'medium', 'large'] as const;
export type AdventureSize = (typeof ADVENTURE_SIZES)[number];
export const ADVENTURE_SIZE_DEFS: Record<AdventureSize, { label: string; w: number; h: number }> = {
  small: { label: 'Pequeña (30 × 22)', w: 30, h: 22 },
  medium: { label: 'Mediana (40 × 30)', w: 40, h: 30 },
  large: { label: 'Grande (56 × 40)', w: 56, h: 40 },
};

export const ADVENTURE_DIFFICULTIES = ['easy', 'medium', 'hard', 'deadly'] as const;
export type AdventureDifficulty = (typeof ADVENTURE_DIFFICULTIES)[number];

export const adventureInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  style: z.enum(MAP_STYLES),
  size: z.enum(ADVENTURE_SIZES).default('medium'),
  /** Cuántas salas (o lo espeso del bosque, las casas del pueblo…), como en el generador. */
  rooms: z.enum(MAP_SIZES).default('normal'),
  /** Nivel de cada personaje del grupo. */
  levels: z.array(z.number().int().min(1).max(20)).min(1).max(10),
  difficulty: z.enum(ADVENTURE_DIFFICULTIES).default('medium'),
  encounters: z.boolean().default(true),
  traps: z.boolean().default(true),
  /** Los monstruos (escondidos en la capa del DM) aparecen solos cuando un jugador entra en su sala. */
  ambush: z.boolean().default(true),
  seed: z.number().int().min(0).max(2 ** 31).optional(),
});
export type AdventureInput = z.input<typeof adventureInputSchema>;
export type AdventureOptions = z.infer<typeof adventureInputSchema> & { seed: number };

/** Un sitio de la aventura (una sala, o un rincón del bosque o de la cueva). */
export interface AdventurePlace {
  /** Número de la nota (1 = la entrada; siguen en orden de recorrido). */
  n: number;
  rect: CellRect;
  title: string;
  text: string;
  encounter: { monsters: { monsterId: string; count: number }[]; difficulty: Difficulty; xp: number } | null;
  /** Trampa: rectángulo (casillas) y su configuración. */
  trap: { rect: CellRect; name: string; trigger: TriggerInput; notes: string } | null;
  /** Tesoro: casilla del cofre. */
  treasure: { x: number; y: number; gold: number } | null;
}

export interface AdventurePlan {
  width: number;
  height: number;
  map: StyledMap;
  places: AdventurePlace[];
}

/** Trampas típicas: nombre, característica de la salvación, tipo de daño y pista para el DM. */
const TRAPS: { name: string; save: string; damageType: string; message: string; hint: string }[] = [
  { name: 'Foso oculto', save: 'des', damageType: 'contundente', message: '¡El suelo cede bajo vuestros pies!', hint: 'Una losa suelta tapa un foso de 3 m.' },
  { name: 'Dardos envenenados', save: 'des', damageType: 'veneno', message: '¡Un chasquido, y salen dardos de las paredes!', hint: 'Agujeros diminutos en las paredes; una placa de presión en el suelo.' },
  { name: 'Runa de fuego', save: 'des', damageType: 'fuego', message: '¡Una runa del suelo estalla en llamas!', hint: 'Una runa casi borrada en el suelo (Investigación CD 13 para verla).' },
  { name: 'Gas venenoso', save: 'con', damageType: 'veneno', message: '¡Un siseo, y la sala se llena de un gas verdoso!', hint: 'Rejillas en el techo; huele a almendras.' },
  { name: 'Cuchilla oscilante', save: 'des', damageType: 'cortante', message: '¡Una cuchilla baja del techo!', hint: 'Una ranura en el techo y un hilo tenso a la altura del tobillo.' },
];

/** CD y daño de una trampa peligrosa según el nivel (como en la Guía del DM). */
function trapPower(level: number): { dc: number; damage: string } {
  if (level <= 4) return { dc: 13, damage: '2d10' };
  if (level <= 10) return { dc: 15, damage: '4d10' };
  if (level <= 16) return { dc: 17, damage: '10d10' };
  return { dc: 19, damage: '18d10' };
}

/** Lo que se ve en una sala, en palabras (para la nota). */
const NOUNS: Record<string, [string, string]> = {
  '📦': ['una caja', 'cajas'],
  '🛢️': ['un barril', 'barriles'],
  '🧰': ['un cofre', 'cofres'],
  '🛏️': ['un camastro', 'camastros'],
  '⚔️': ['armas', 'armas'],
  '🛡️': ['un escudo', 'escudos'],
  '🪑': ['una silla', 'sillas'],
  '🍖': ['una mesa con comida', 'mesas con comida'],
  '⛓️': ['cadenas', 'cadenas'],
  '💀': ['una calavera', 'calaveras'],
  '🦴': ['huesos', 'huesos'],
  '💰': ['monedas', 'monedas'],
  '💎': ['una gema', 'gemas'],
  '🕸️': ['telarañas', 'telarañas'],
  '⚰️': ['un ataúd', 'ataúdes'],
  '🕯️': ['velas', 'velas'],
  '🗿': ['una estatua', 'estatuas'],
  '📜': ['un pergamino', 'pergaminos'],
  '🏺': ['una vasija', 'vasijas'],
  '📚': ['una estantería con libros', 'estanterías con libros'],
  '🔥': ['un fuego', 'fuegos'],
  '🪨': ['rocas', 'rocas'],
  '🍄': ['setas', 'setas'],
  '🪵': ['troncos', 'troncos'],
  '⛺': ['una tienda de campaña', 'tiendas de campaña'],
  '🍺': ['jarras', 'jarras'],
  '🐎': ['un caballo', 'caballos'],
  '🌾': ['paja', 'paja'],
  '👑': ['un trono', 'tronos'],
  '🏳️': ['estandartes', 'estandartes'],
  '🪔': ['lámparas', 'lámparas'],
  '⛲': ['un pozo', 'pozos'],
  '🎪': ['un puesto de mercado', 'puestos de mercado'],
  '🗄️': ['un armario', 'armarios'],
  '⛏️': ['un pico', 'picos'],
};

function describe(objects: { emoji: string }[]): string {
  const counts = new Map<string, number>();
  for (const o of objects) if (NOUNS[o.emoji]) counts.set(o.emoji, (counts.get(o.emoji) ?? 0) + 1);
  const words = [...new Set([...counts].map(([e, n]) => NOUNS[e]![n > 1 ? 1 : 0]))];
  if (!words.length) return 'Está vacía.';
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}` : words[0];
  return `Hay ${list}.`;
}

/** Nombres de los sitios de los mapas sin salas. */
const PLACE_NAMES: Partial<Record<MapStyle, string[]>> = {
  cave: ['Gruta', 'Galería', 'Cámara húmeda', 'Sima', 'Cueva de los ecos', 'Cubil'],
  forest: ['Linde del bosque', 'Arboleda', 'Claro', 'Sendero', 'Rocas con musgo', 'Espesura'],
  road: ['Recodo del camino', 'Linde del bosque', 'Tramo despejado', 'Cuneta', 'Arboleda', 'Junto al camino'],
};

const STEP_UP: Record<AdventureDifficulty, AdventureDifficulty> = { easy: 'medium', medium: 'hard', hard: 'deadly', deadly: 'deadly' };

/** Planifica la aventura (mismo resultado con la misma semilla). */
export function planAdventure(input: AdventureOptions): AdventurePlan {
  const { w, h } = ADVENTURE_SIZE_DEFS[input.size];
  const rnd = seededRng(input.seed ^ 0x2545f491);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const map = generateStyled(w, h, { seed: input.seed, style: input.style, size: input.rooms, furnish: true });
  const t = map.terrain;
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !isSolidCell(t[y * w + x]) && t[y * w + x] !== 'a' && t[y * w + x] !== 'A';
  const objectAt = new Set(map.objects.map((o) => `${o.x},${o.y}`));

  // Sitios: las salas (o casas); si no hay (cueva, bosque, camino), rincones de suelo bien separados.
  let rects: { rect: CellRect; title: string }[] = (map.rooms ?? []).map((rect, i) => ({ rect, title: map.roomKinds[i] ?? 'Sala' }));
  if (rects.length < 2) {
    const cells: number[] = [];
    for (let i = 0; i < w * h; i++) if (free(i % w, Math.floor(i / w))) cells.push(i);
    const count = Math.max(3, Math.min(8, Math.round((w * h) / 160)));
    const picked: number[] = [];
    // El primero, el más a la izquierda (la entrada); luego, cada vez el más lejano a los ya elegidos.
    if (cells.length) picked.push(cells.reduce((a, b) => (b % w < a % w ? b : a)));
    while (picked.length < count && cells.length) {
      let best = -1;
      let bestD = -1;
      for (const c of cells) {
        const d = Math.min(...picked.map((p) => Math.hypot((c % w) - (p % w), Math.floor(c / w) - Math.floor(p / w))));
        if (d > bestD) [best, bestD] = [c, d];
      }
      if (bestD < 4) break;
      picked.push(best);
    }
    const names = [...(PLACE_NAMES[input.style] ?? ['Lugar'])];
    rects = picked.map((c, i) => {
      const x = Math.max(0, Math.min(w - 5, (c % w) - 2));
      const y = Math.max(0, Math.min(h - 5, Math.floor(c / w) - 2));
      return { rect: { x, y, w: 5, h: 5 }, title: names[i % names.length]! };
    });
  }
  if (!rects.length) return { width: w, height: h, map, places: [] };

  // Orden de recorrido: desde la sala más a la izquierda, siempre a la más cercana que quede.
  const centre = (r: CellRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const left = rects.reduce((a, b) => (centre(b.rect).x < centre(a.rect).x ? b : a));
  const route = [left];
  const rest = rects.filter((r) => r !== left);
  while (rest.length) {
    const last = centre(route[route.length - 1]!.rect);
    rest.sort((a, b) => Math.hypot(centre(a.rect).x - last.x, centre(a.rect).y - last.y) - Math.hypot(centre(b.rect).x - last.x, centre(b.rect).y - last.y));
    route.push(rest.shift()!);
  }

  const level = Math.round(input.levels.reduce((a, b) => a + b, 0) / input.levels.length);
  const power = trapPower(level);
  const last = route.length - 1;
  // Qué sitios llevan encuentro y trampa (la entrada nunca; la última, siempre el jefe).
  const inner = route.map((_, i) => i).filter((i) => i > 0 && i < last);
  const shuffled = [...inner].sort(() => rnd() - 0.5);
  const withEncounter = new Set(input.encounters ? shuffled.slice(0, Math.round(inner.length * 0.45)) : []);
  if (input.encounters && last > 0) withEncounter.add(last);
  const withTrap = new Set(input.traps ? shuffled.filter((i) => !withEncounter.has(i)).slice(0, Math.max(1, Math.round(inner.length * 0.25))) : []);
  let trapBag = [...TRAPS].sort(() => rnd() - 0.5);

  const places: AdventurePlace[] = route.map(({ rect, title }, i) => {
    const inside = map.objects.filter((o) => o.x >= rect.x && o.y >= rect.y && o.x < rect.x + rect.w && o.y < rect.y + rect.h);
    const lines = [describe(inside)];
    let encounter: AdventurePlace['encounter'] = null;
    if (withEncounter.has(i)) {
      const difficulty = i === last ? STEP_UP[input.difficulty] : input.difficulty;
      const monsters = suggestEncounter(input.levels, difficulty, rnd);
      if (monsters.length) {
        const rating = rateEncounter(monsters, input.levels);
        encounter = { monsters, difficulty: rating.difficulty, xp: rating.xp };
        const who = monsters.map((m) => `${m.count} × ${monsterById(m.monsterId)?.name ?? m.monsterId}`).join(', ');
        lines.push(`${i === last ? 'Jefe final' : 'Encuentro'} (${DIFFICULTY_LABELS[rating.difficulty]}, ${rating.xp} PX): ${who}. ${input.ambush ? 'Escondidos: aparecen al entrar un jugador.' : 'Escondidos en la capa del DM.'}`);
      }
    }
    let trap: AdventurePlace['trap'] = null;
    if (withTrap.has(i)) {
      if (!trapBag.length) trapBag = [...TRAPS].sort(() => rnd() - 0.5);
      const kind = trapBag.pop()!;
      // Una casilla libre (sin muebles) por dentro de la sala, mejor lejos de las paredes.
      const spots: { x: number; y: number }[] = [];
      for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) for (let x = rect.x + 1; x < rect.x + rect.w - 1; x++) if (free(x, y) && !objectAt.has(`${x},${y}`)) spots.push({ x, y });
      const at = spots.length ? spots[Math.floor(rnd() * spots.length)]! : { x: rect.x + Math.floor(rect.w / 2), y: rect.y + Math.floor(rect.h / 2) };
      const saveLabel = kind.save === 'con' ? 'Constitución' : 'Destreza';
      trap = {
        rect: { x: at.x, y: at.y, w: 1, h: 1 },
        name: kind.name,
        trigger: { kind: 'trap', message: kind.message, save: kind.save, dc: power.dc, half: true, damage: power.damage, damageType: kind.damageType, reveal: true },
        notes: `${kind.hint} Percepción CD ${power.dc} para darse cuenta; se desactiva con herramientas de ladrón (CD ${power.dc}).`,
      };
      lines.push(`Trampa: ${kind.name} (${saveLabel} CD ${power.dc}, ${power.damage} de ${kind.damageType}). ${kind.hint}`);
    }
    let treasure: AdventurePlace['treasure'] = null;
    if (i === last && last > 0) {
      const gold = int(2, 6) * 10 * level;
      const spot = (() => {
        for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (free(x, y) && !objectAt.has(`${x},${y}`) && (x === rect.x || y === rect.y)) return { x, y };
        return { x: rect.x, y: rect.y };
      })();
      treasure = { ...spot, gold };
      lines.push(`Tesoro: un cofre con ${gold} po (y lo que quieras añadir).`);
    }
    if (i === 0) lines.push('Aquí empieza la aventura: pon aquí los tokens del grupo.');
    // La descripción se puede leer a los jugadores (📣); lo de después de la raya es solo para el DM.
    const [seen, ...secret] = lines;
    const text = secret.length ? `${seen}\n---\n${secret.join('\n')}` : seen!;
    return { n: i + 1, rect, title: i === 0 ? `Entrada (${title.toLowerCase()})` : title, text, encounter, trap, treasure };
  });
  return { width: w, height: h, map, places };
}

