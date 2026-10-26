import { describe, expect, it } from 'vitest';
import { pathEntersRect, segmentHitsRect, triggerSchema } from '../src/index.js';

const r = { x: 100, y: 100, w: 100, h: 100 };

describe('trampas: cuándo entra un token en la zona', () => {
  it('cruzarla de paso cuenta; pasar por fuera o rozar el borde, no', () => {
    expect(segmentHitsRect({ x: 0, y: 150 }, { x: 300, y: 150 }, r)).toBe(true);
    expect(segmentHitsRect({ x: 0, y: 50 }, { x: 300, y: 50 }, r)).toBe(false);
    expect(segmentHitsRect({ x: 0, y: 100 }, { x: 300, y: 100 }, r)).toBe(false);
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 300, y: 300 }, r)).toBe(true);
  });

  it('solo si empieza fuera; los puntos de giro cuentan', () => {
    expect(pathEntersRect([{ x: 0, y: 150 }, { x: 150, y: 150 }], r)).toBe(true);
    expect(pathEntersRect([{ x: 150, y: 150 }, { x: 180, y: 120 }], r)).toBe(false);
    // Rodeo por debajo: no entra.
    expect(pathEntersRect([{ x: 50, y: 150 }, { x: 50, y: 250 }, { x: 250, y: 250 }, { x: 250, y: 150 }], r)).toBe(false);
    expect(pathEntersRect([{ x: 50, y: 150 }], r)).toBe(false);
  });

  it('valida la fórmula de daño y pone valores por defecto', () => {
    expect(triggerSchema.parse({ kind: 'trap' })).toMatchObject({ active: true, once: true, who: 'players', dc: 13, half: true, reveal: false });
    expect(triggerSchema.safeParse({ kind: 'trap', damage: '2d6 +' }).success).toBe(false);
    expect(triggerSchema.safeParse({ kind: 'trap', damage: '2d10' }).success).toBe(true);
  });
});
