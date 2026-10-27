import type { TokenAi } from '../schemas/ai.js';
import { tr } from '../i18n/index.js';

/**
 * Planificador de la IA de enemigos: decide en la cuadrícula adónde se mueve una
 * criatura y si puede atacar. Es puro (sin base de datos ni dados) para poder probarlo.
 */

export interface Cell {
  col: number;
  row: number;
}

/** Criatura en la cuadrícula: `cell` es su esquina superior izquierda y `size` cuántas casillas ocupa de lado. */
export interface PlanCreature {
  id: string;
  name: string;
  cell: Cell;
  size: number;
  hp: number | null;
  hpMax: number | null;
}

export interface PlanInput {
  cols: number;
  rows: number;
  self: PlanCreature;
  /** Movimiento disponible, en casillas. */
  speed: number;
  ai: TokenAi;
  /** Enemigos de la criatura (los personajes de los jugadores). Bloquean el paso. */
  targets: PlanCreature[];
  /** Otros tokens: se puede pasar a través pero no terminar encima. */
  others: { cell: Cell; size: number }[];
  /** Coste de moverse en diagonal (1 en 5e). */
  diagonalCost: number;
  rng?: () => number;
  /** ¿Hay una pared entre estas dos casillas vecinas? (sin paredes, nunca) */
  blocked?: (from: Cell, to: Cell) => boolean;
  /** ¿Ve al objetivo desde esa casilla? Sin línea de visión no puede atacarle. */
  sees?: (from: Cell, target: PlanCreature) => boolean;
}

export type PlanMode = 'attack' | 'approach' | 'flee' | 'hold' | 'none';

export interface Plan {
  /** Casillas por las que pasa, sin contar la de salida. */
  path: Cell[];
  targetId: string | null;
  attack: boolean;
  mode: PlanMode;
  /** Explicación para el chat. */
  reason: string;
}

/** Distancia en casillas entre dos criaturas (1 = adyacentes), contando su tamaño. */
export function gap(a: Cell, aSize: number, b: Cell, bSize: number): number {
  const dx = Math.max(0, b.col - (a.col + aSize - 1), a.col - (b.col + bSize - 1));
  const dy = Math.max(0, b.row - (a.row + aSize - 1), a.row - (b.row + bSize - 1));
  return Math.max(dx, dy);
}

const overlaps = (a: Cell, aSize: number, b: Cell, bSize: number) =>
  a.col < b.col + bSize && b.col < a.col + aSize && a.row < b.row + bSize && b.row < a.row + aSize;

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Dijkstra desde la casilla de la criatura: coste para llegar a cada casilla y de dónde viene. */
function explore(input: PlanInput) {
  const { cols, rows, self, targets, diagonalCost } = input;
  const size = self.size;
  const idx = (c: Cell) => c.row * cols + c.col;
  const cost = new Float64Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  const passable = (c: Cell) =>
    c.col >= 0 && c.row >= 0 && c.col + size <= cols && c.row + size <= rows && !targets.some((t) => overlaps(c, size, t.cell, t.size));

  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };

  cost[idx(self.cell)] = 0;
  push([0, idx(self.cell)]);
  while (heap.length) {
    const [c, i] = pop();
    if (c > cost[i]!) continue;
    const col = i % cols;
    const row = (i - col) / cols;
    for (const [dx, dy] of NEIGHBORS) {
      const n = { col: col + dx, row: row + dy };
      if (!passable(n) || input.blocked?.({ col, row }, n)) continue;
      // Una pizca de coste extra en diagonal para que, a igualdad, prefiera caminos rectos (más naturales).
      const nc = c + (dx && dy ? diagonalCost + 1e-4 : 1);
      const ni = idx(n);
      if (nc < cost[ni]!) {
        cost[ni] = nc;
        prev[ni] = i;
        push([nc, ni]);
      }
    }
  }

  const cellOf = (i: number): Cell => ({ col: i % cols, row: Math.floor(i / cols) });
  const pathTo = (c: Cell): Cell[] => {
    const out: Cell[] = [];
    for (let i = idx(c); i !== idx(self.cell) && i >= 0; i = prev[i]!) out.push(cellOf(i));
    return out.reverse();
  };
  /** ¿Puede terminar el movimiento ahí? (no encima de otro token) */
  const canEnd = (c: Cell) =>
    (c.col === self.cell.col && c.row === self.cell.row) || !input.others.some((o) => overlaps(c, size, o.cell, o.size));

  return { cost, idx, cellOf, pathTo, canEnd };
}

/** Recorta un camino al movimiento disponible, terminando en una casilla libre. */
function truncate(path: Cell[], ex: ReturnType<typeof explore>, budget: number): Cell[] {
  let end = 0;
  for (let i = 0; i < path.length; i++) {
    if (ex.cost[ex.idx(path[i]!)]! > budget + 0.01) break;
    if (ex.canEnd(path[i]!)) end = i + 1;
  }
  return path.slice(0, end);
}

/**
 * Mejor casilla alcanzable que cumpla `ok`: la más barata de recorrer (y luego la más
 * cercana al objetivo), o con `closest` la más cercana al objetivo (y luego la más barata).
 */
function bestCell(input: PlanInput, ex: ReturnType<typeof explore>, ok: (c: Cell) => boolean, target: PlanCreature, closest = false) {
  let best: { cell: Cell; cost: number; d: number } | null = null;
  for (let i = 0; i < ex.cost.length; i++) {
    const cost = ex.cost[i]!;
    if (cost === Infinity) continue;
    const cell = ex.cellOf(i);
    if (!ex.canEnd(cell) || !ok(cell)) continue;
    const d = gap(cell, input.self.size, target.cell, target.size);
    const [k1, k2, b1, b2] = closest ? [d, cost, best?.d, best?.cost] : [cost, d, best?.cost, best?.d];
    if (!best || k1 < b1! - 1e-9 || (Math.abs(k1 - b1!) < 1e-9 && k2 < b2!)) best = { cell, cost, d };
  }
  return best;
}

const hpRatio = (c: PlanCreature) => (c.hp !== null && c.hpMax ? c.hp / c.hpMax : 1);

function pickTarget(input: PlanInput, candidates: PlanCreature[]): PlanCreature {
  const { self, ai } = input;
  const dist = (t: PlanCreature) => gap(self.cell, self.size, t.cell, t.size);
  if (ai.target === 'random') return candidates[Math.floor((input.rng ?? Math.random)() * candidates.length)]!;
  const sorted = [...candidates].sort((a, b) =>
    ai.target === 'weakest' ? hpRatio(a) - hpRatio(b) || dist(a) - dist(b) : dist(a) - dist(b) || hpRatio(a) - hpRatio(b),
  );
  return sorted[0]!;
}

/** Decide el turno de la criatura. */
export function planTurn(input: PlanInput): Plan {
  const { self, ai, targets } = input;
  const budget = Math.max(0, Math.floor(input.speed + 1e-9));
  const none = (reason: string, mode: PlanMode = 'none'): Plan => ({ path: [], targetId: null, attack: false, mode, reason });
  if (!targets.length) return none(tr('no ve a ningún enemigo'));

  const distTo = (c: Cell, t: PlanCreature) => gap(c, self.size, t.cell, t.size);
  const nearestGap = (c: Cell) => Math.min(...targets.map((t) => distTo(c, t)));
  const ex = explore(input);

  // Prudente y malherido: huye lo más lejos posible.
  if (ai.behavior === 'cautious' && self.hp !== null && self.hpMax && hpRatio(self) < ai.fleeBelow) {
    let best: { cell: Cell; d: number; cost: number } | null = null;
    for (let i = 0; i < ex.cost.length; i++) {
      const cost = ex.cost[i]!;
      if (cost > budget + 0.01) continue;
      const cell = ex.cellOf(i);
      if (!ex.canEnd(cell)) continue;
      const d = nearestGap(cell);
      if (!best || d > best.d || (d === best.d && cost < best.cost)) best = { cell, d, cost };
    }
    return { path: best ? ex.pathTo(best.cell) : [], targetId: null, attack: false, mode: 'flee', reason: tr('está malherido y huye') };
  }

  // Guardián: espera hasta que alguien entra en su radio.
  let candidates = targets;
  if (ai.behavior === 'guard') {
    candidates = targets.filter((t) => distTo(self.cell, t) <= ai.guardRadius && (input.sees?.(self.cell, t) ?? true));
    if (!candidates.length) return none(tr('vigila su posición'), 'hold');
  }

  const target = pickTarget(input, candidates);
  const ranged = ai.behavior === 'ranged';
  const inRange = (c: Cell) => {
    const d = distTo(c, target);
    return (ranged ? d <= ai.range : d <= ai.reach) && (input.sees?.(c, target) ?? true);
  };
  const attackFrom = (path: Cell[], reason: string): Plan => ({ path, targetId: target.id, attack: true, mode: 'attack', reason });

  if (ranged) {
    // Si tiene a alguien pegado, intenta apartarse antes de disparar.
    if (nearestGap(self.cell) <= 1) {
      const away = bestCell(input, ex, (c) => ex.cost[ex.idx(c)]! <= budget + 0.01 && nearestGap(c) >= 2 && inRange(c), target);
      if (away) return attackFrom(ex.pathTo(away.cell), tr('se aparta y dispara a {name}', { name: target.name }));
    }
    if (inRange(self.cell)) return attackFrom([], tr('dispara a {name}', { name: target.name }));
  } else if (inRange(self.cell)) {
    return attackFrom([], tr('ataca a {name}', { name: target.name }));
  }

  // Acercarse hasta tener al objetivo a su alcance.
  const goal =
    (ranged ? bestCell(input, ex, (c) => inRange(c) && nearestGap(c) >= 2, target) : null) ?? bestCell(input, ex, inRange, target);
  if (goal) {
    const full = ex.pathTo(goal.cell);
    if (goal.cost <= budget + 0.01) return attackFrom(full, `${ranged ? tr('se coloca y dispara') : tr('carga contra')} ${target.name}`);
    return { path: truncate(full, ex, budget), targetId: target.id, attack: false, mode: 'approach', reason: tr('avanza hacia {name}', { name: target.name }) };
  }

  // Sin camino hasta el objetivo: se acerca todo lo que puede.
  const closer = bestCell(input, ex, (c) => ex.cost[ex.idx(c)]! <= budget + 0.01, target, true);
  if (closer && distTo(closer.cell, target) < distTo(self.cell, target)) {
    return { path: ex.pathTo(closer.cell), targetId: target.id, attack: false, mode: 'approach', reason: tr('intenta llegar hasta {name}', { name: target.name }) };
  }
  return none(tr('no encuentra camino hasta {name}', { name: target.name }));
}
