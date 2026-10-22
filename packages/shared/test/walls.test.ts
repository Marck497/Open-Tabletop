import { describe, expect, it } from 'vitest';
import {
  canMoveStraight,
  hasLineOfSight,
  planTurn,
  pointInPolygon,
  seesRect,
  visibilityPolygon,
  wallGrid,
  wallsForPlayer,
  wallsSchema,
  blocksMove,
  DEFAULT_TOKEN_AI,
  type Wall,
} from '../src/index.js';

const wall = (x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({
  id: `${x1},${y1},${x2},${y2}`,
  x1,
  y1,
  x2,
  y2,
  kind: 'wall',
  open: false,
  locked: false,
  ...extra,
});

describe('paredes y visión', () => {
  const middle = wall(100, 0, 100, 200);

  it('la línea de visión se corta con paredes y puertas cerradas, no con ventanas ni puertas abiertas', () => {
    const a = { x: 50, y: 100 };
    const b = { x: 150, y: 100 };
    expect(hasLineOfSight(a, b, [])).toBe(true);
    expect(hasLineOfSight(a, b, [middle])).toBe(false);
    expect(hasLineOfSight(a, b, [{ ...middle, kind: 'window' }])).toBe(true);
    expect(hasLineOfSight(a, b, [{ ...middle, kind: 'door' }])).toBe(false);
    expect(hasLineOfSight(a, b, [{ ...middle, kind: 'door', open: true }])).toBe(true);
    // Se puede ignorar una pared concreta (para "ver" la puerta que se tiene delante).
    expect(hasLineOfSight(a, { x: 100, y: 100 }, [middle], middle.id)).toBe(true);
    // Por encima de la pared no hay nada que tape.
    expect(hasLineOfSight({ x: 50, y: 250 }, { x: 150, y: 250 }, [middle])).toBe(true);
  });

  it('las ventanas impiden el paso aunque dejen ver', () => {
    const a = { x: 50, y: 100 };
    const b = { x: 150, y: 100 };
    expect(canMoveStraight(a, b, [{ ...middle, kind: 'window' }])).toBe(false);
    expect(canMoveStraight(a, b, [{ ...middle, kind: 'door', open: true }])).toBe(true);
    const crosses = wallGrid([middle], 70, blocksMove);
    expect(crosses(a, b)).toBe(true);
    expect(crosses({ x: 35, y: 35 }, { x: 35, y: 105 })).toBe(false);
  });

  it('el polígono de visión no pasa de la pared y respeta el alcance', () => {
    const poly = visibilityPolygon({ x: 50, y: 100 }, [middle], 400, 200);
    expect(pointInPolygon({ x: 80, y: 30 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 100 }, poly)).toBe(false);
    const open = visibilityPolygon({ x: 50, y: 100 }, [], 400, 200);
    expect(pointInPolygon({ x: 350, y: 100 }, open)).toBe(true);
    const short = visibilityPolygon({ x: 50, y: 100 }, [], 400, 200, 60);
    expect(pointInPolygon({ x: 100, y: 100 }, short)).toBe(true);
    expect(pointInPolygon({ x: 130, y: 100 }, short)).toBe(false);
  });

  it('un token se ve si se ve una parte de él', () => {
    const eyes = [{ x: 50, y: 100 }];
    expect(seesRect(eyes, { x: 130, y: 70, width: 60, height: 60 }, [middle])).toBe(false);
    expect(seesRect(eyes, { x: 130, y: 70, width: 60, height: 60 }, [])).toBe(true);
    expect(seesRect(eyes, { x: 300, y: 70, width: 60, height: 60 }, [], 100)).toBe(false);
  });

  it('los jugadores ven las puertas secretas como paredes', () => {
    const [closed, opened] = wallsForPlayer([wall(0, 0, 1, 1, { kind: 'secret', id: 'a' }), wall(0, 0, 1, 1, { kind: 'secret', id: 'b', open: true })]);
    expect(closed).toMatchObject({ kind: 'wall' });
    expect(opened).toMatchObject({ kind: 'door', open: true, locked: true });
    expect(() => wallsSchema.parse([{ id: 'x', x1: 0, y1: 0, x2: 1, y2: 1, kind: 'muro' }])).toThrow();
  });

  it('la IA rodea las paredes y no ataca a través de ellas', () => {
    // Pared vertical en x = 3 casillas, de la fila 0 a la 4; hueco por debajo.
    const g = 70;
    const walls = [wall(3 * g, 0, 3 * g, 4 * g)];
    const crosses = wallGrid(walls, g, blocksMove);
    const center = (c: { col: number; row: number }) => ({ x: (c.col + 0.5) * g, y: (c.row + 0.5) * g });
    const target = { id: 't', name: 'Ana', cell: { col: 4, row: 1 }, size: 1, hp: 10, hpMax: 10 };
    const plan = planTurn({
      cols: 8,
      rows: 8,
      self: { id: 's', name: 'Orco', cell: { col: 2, row: 1 }, size: 1, hp: 10, hpMax: 10 },
      speed: 12,
      ai: { ...DEFAULT_TOKEN_AI, enabled: true },
      targets: [target],
      others: [],
      diagonalCost: 1,
      blocked: (a, b) => crosses(center(a), center(b)),
      sees: (c, t) => hasLineOfSight(center(c), center(t.cell), walls),
    });
    expect(plan.attack).toBe(true);
    // Tiene que bajar hasta la fila 4 para pasar: ningún paso cruza la pared.
    expect(plan.path.some((c) => c.row >= 4)).toBe(true);
    const last = plan.path[plan.path.length - 1]!;
    expect(last.col).toBeGreaterThanOrEqual(3);
  });
});
