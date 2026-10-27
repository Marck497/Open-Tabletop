import { describe, expect, it } from 'vitest';
import { checkSyntax, evaluate, ExprError } from '../src/expr.js';
import { naturalOutcome } from '../src/index.js';

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

describe('críticos y pifias', () => {
  const d = (expr: string, sides: number, results: number[], kept = results.map((_, i) => i)) => ({ expr, sides, results, kept });
  it('mira solo los d20 que cuentan', () => {
    expect(naturalOutcome({ rolls: [d('1d20', 20, [20])] })).toBe('crit');
    expect(naturalOutcome({ rolls: [d('1d20', 20, [1])] })).toBe('fumble');
    expect(naturalOutcome({ rolls: [d('1d20', 20, [13])] })).toBeNull();
    expect(naturalOutcome({ rolls: [d('1d6', 6, [1])] })).toBeNull();
    // Ventaja: el 1 descartado no cuenta.
    expect(naturalOutcome({ rolls: [d('2d20kh1', 20, [1, 15], [1])] })).toBeNull();
    expect(naturalOutcome({ rolls: [d('2d20kl1', 20, [20, 4], [1])] })).toBeNull();
    expect(naturalOutcome({ rolls: [d('2d20', 20, [1, 20])] })).toBe('crit');
    expect(naturalOutcome(null)).toBeNull();
  });
  it('con una tirada de verdad', () => {
    const r = evaluate('1d20+3', { rng: () => 0.999 });
    expect(naturalOutcome(r)).toBe('crit');
    expect(naturalOutcome(evaluate('1d20+3', { rng: () => 0 }))).toBe('fumble');
  });
});

describe('entradas extremas', () => {
  it('lo muy anidado da un error claro en vez de desbordar la pila', () => {
    expect(() => evaluate('('.repeat(20000) + '1' + ')'.repeat(20000))).toThrow(ExprError);
    expect(() => evaluate('-'.repeat(50000) + '1')).toThrow(ExprError);
    expect(evaluate('((((1 + 2))))').value).toBe(3);
  });

  it('min() y max() sin argumentos valen 0, y nada da infinito', () => {
    expect(evaluate('max()').value).toBe(0);
    expect(evaluate('min() + 1').value).toBe(1);
    expect(evaluate('1/0').value).toBe(0);
  });
});
