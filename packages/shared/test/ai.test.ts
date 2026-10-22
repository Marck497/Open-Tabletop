import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKEN_AI, gap, planTurn, tokenAiSchema, type PlanCreature, type PlanInput } from '../src/index.js';

const pc = (id: string, col: number, row: number, extra: Partial<PlanCreature> = {}): PlanCreature => ({
  id,
  name: id,
  cell: { col, row },
  size: 1,
  hp: 10,
  hpMax: 10,
  ...extra,
});

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    cols: 20,
    rows: 20,
    self: pc('orco', 0, 0),
    speed: 6,
    ai: DEFAULT_TOKEN_AI,
    targets: [],
    others: [],
    diagonalCost: 1,
    ...over,
  };
}

const last = (p: { path: { col: number; row: number }[] }) => p.path[p.path.length - 1];

describe('IA de enemigos', () => {
  it('calcula la distancia entre criaturas de distinto tamaño', () => {
    expect(gap({ col: 0, row: 0 }, 1, { col: 1, row: 1 }, 1)).toBe(1);
    expect(gap({ col: 0, row: 0 }, 2, { col: 3, row: 0 }, 1)).toBe(2);
    expect(gap({ col: 5, row: 5 }, 1, { col: 3, row: 3 }, 2)).toBe(1);
  });

  it('sin enemigos a la vista no hace nada', () => {
    const plan = planTurn(input());
    expect(plan).toMatchObject({ attack: false, mode: 'none', path: [] });
  });

  it('cuerpo a cuerpo: si ya está al lado, ataca sin moverse', () => {
    const plan = planTurn(input({ targets: [pc('ana', 1, 1)] }));
    expect(plan).toMatchObject({ attack: true, targetId: 'ana', path: [] });
  });

  it('carga contra el más cercano y se queda pegado', () => {
    const plan = planTurn(input({ targets: [pc('lejos', 15, 15), pc('ana', 5, 0)] }));
    expect(plan.targetId).toBe('ana');
    expect(plan.attack).toBe(true);
    expect(last(plan)).toEqual({ col: 4, row: 0 });
    expect(plan.path).toHaveLength(4);
  });

  it('si no llega, avanza todo lo que permite su velocidad', () => {
    const plan = planTurn(input({ speed: 3, targets: [pc('ana', 10, 0)] }));
    expect(plan).toMatchObject({ attack: false, mode: 'approach' });
    expect(plan.path).toHaveLength(3);
    expect(last(plan)).toEqual({ col: 3, row: 0 });
  });

  it('no termina encima de otro token ni atraviesa enemigos', () => {
    // Un aliado ocupa la casilla ideal: debe elegir otra adyacente.
    const plan = planTurn(input({ targets: [pc('ana', 5, 0)], others: [{ cell: { col: 4, row: 0 }, size: 1 }] }));
    expect(plan.attack).toBe(true);
    expect(last(plan)).not.toEqual({ col: 4, row: 0 });
    expect(gap(last(plan)!, 1, { col: 5, row: 0 }, 1)).toBe(1);
    // Ningún paso pisa a un enemigo.
    const walled = planTurn(input({ speed: 30, targets: [pc('ana', 6, 0), pc('b1', 3, 0), pc('b2', 3, 1)], ai: tokenAiSchema.parse({ target: 'weakest' }) }));
    expect(walled.path.some((c) => c.col === 3 && c.row <= 1)).toBe(false);
  });

  it('elige al más herido si se lo pides', () => {
    const plan = planTurn(input({ ai: tokenAiSchema.parse({ target: 'weakest' }), targets: [pc('sano', 2, 0), pc('herido', 6, 0, { hp: 2 })] }));
    expect(plan.targetId).toBe('herido');
  });

  it('a distancia: dispara sin acercarse si está en alcance, y se aparta si lo tienen pegado', () => {
    const ai = tokenAiSchema.parse({ behavior: 'ranged', range: 12 });
    const far = planTurn(input({ ai, targets: [pc('ana', 8, 0)] }));
    expect(far).toMatchObject({ attack: true, path: [] });
    const close = planTurn(input({ ai, self: pc('arquero', 5, 5), targets: [pc('ana', 6, 5)] }));
    expect(close.attack).toBe(true);
    expect(close.path.length).toBeGreaterThan(0);
    expect(gap(last(close)!, 1, { col: 6, row: 5 }, 1)).toBeGreaterThanOrEqual(2);
  });

  it('prudente: huye cuando le queda poca vida', () => {
    const ai = tokenAiSchema.parse({ behavior: 'cautious', fleeBelow: 0.5 });
    const plan = planTurn(input({ ai, self: pc('kobold', 5, 5, { hp: 2, hpMax: 10 }), targets: [pc('ana', 6, 5)] }));
    expect(plan).toMatchObject({ mode: 'flee', attack: false });
    expect(gap(last(plan)!, 1, { col: 6, row: 5 }, 1)).toBeGreaterThan(4);
  });

  it('guardián: espera hasta que alguien se acerca', () => {
    const ai = tokenAiSchema.parse({ behavior: 'guard', guardRadius: 3 });
    expect(planTurn(input({ ai, targets: [pc('ana', 10, 0)] })).mode).toBe('hold');
    expect(planTurn(input({ ai, targets: [pc('ana', 3, 0)] })).attack).toBe(true);
  });

  it('criaturas grandes: ocupan varias casillas y no se salen del mapa', () => {
    const plan = planTurn(input({ cols: 8, rows: 8, self: pc('ogro', 0, 0, { size: 2 }), targets: [pc('ana', 7, 7)] }));
    expect(plan.attack).toBe(true);
    const end = last(plan)!;
    expect(end.col + 2).toBeLessThanOrEqual(8);
    expect(gap(end, 2, { col: 7, row: 7 }, 1)).toBe(1);
  });
});
