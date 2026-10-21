import { describe, expect, it } from 'vitest';
import { checkSyntax, evaluate } from '../src/expr.js';

/** Generador que devuelve siempre los mismos valores (para tests). */
const fixed = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};

describe('fórmulas', () => {
  it('aritmética, precedencia y funciones', () => {
    expect(evaluate('2 + 3 * 4').value).toBe(14);
    expect(evaluate('(2 + 3) * 4').value).toBe(20);
    expect(evaluate('floor((15 - 10) / 2)').value).toBe(2);
    expect(evaluate('floor((7 - 10) / 2)').value).toBe(-2);
    expect(evaluate('max(1, 5, 3) - min(4, 2)').value).toBe(3);
    expect(evaluate('-3 + +2').value).toBe(-1);
  });

  it('referencias, condicionales y texto', () => {
    const vals: Record<string, unknown> = { fue: 16, comp: true, car: 'sab', danio: '1d8+@{fue}' };
    const resolve = (n: string) => vals[n];
    expect(evaluate('fue + @{fue}', { resolve }).value).toBe(32);
    expect(evaluate('if(comp, 2, 0)', { resolve }).value).toBe(2);
    expect(evaluate('if(car == "sab", 1, 9)', { resolve }).value).toBe(1);
    expect(evaluate('desconocido + 1', { resolve }).value).toBe(1);
  });

  it('las fórmulas no pueden tirar dados', () => {
    expect(() => evaluate('1d20')).toThrow();
  });

  it('errores de sintaxis', () => {
    expect(checkSyntax('1 + ')).not.toBeNull();
    expect(checkSyntax('floor(2')).not.toBeNull();
    expect(checkSyntax('1 $ 2')).not.toBeNull();
    expect(checkSyntax('d20_bonus + 1')).toBeNull();
  });
});

describe('tiradas', () => {
  it('tira dados y suma', () => {
    // rng 0.5 en d20 → 11; en d6 → 4
    const r = evaluate('1d20 + 2d6 + 3', { rng: fixed(0.5) });
    expect(r.value).toBe(11 + 4 + 4 + 3);
    expect(r.rolls.map((x) => x.expr)).toEqual(['1d20', '2d6']);
  });

  it('ventaja y desventaja', () => {
    const adv = evaluate('2d20kh1', { rng: fixed(0.1, 0.9) });
    expect(adv.value).toBe(19);
    expect(adv.rolls[0]!.kept).toEqual([1]);
    const dis = evaluate('2d20kl1', { rng: fixed(0.1, 0.9) });
    expect(dis.value).toBe(3);
  });

  it('evalúa expresiones guardadas en campos de texto', () => {
    const r = evaluate('@{danio}', { rng: fixed(0.99), resolve: (n) => ({ danio: '1d8 + fue', fue: 3 })[n] });
    expect(r.value).toBe(11);
  });

  it('limita la cantidad de dados', () => {
    expect(() => evaluate('1000d6', { rng: Math.random })).toThrow();
  });
});
