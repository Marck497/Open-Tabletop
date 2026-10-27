import { tr } from './i18n/index.js';
/**
 * Mini lenguaje de fórmulas y tiradas, seguro (sin eval) y compartido por servidor y web.
 *
 *   floor((fue - 10) / 2)            fórmula de una hoja
 *   1d20 + @{fue_mod} + competencia  tirada
 *   2d20kh1 + 5                      ventaja (quedarse con el más alto)
 *   if(sv_fue_prof, competencia, 0)  condicionales
 *
 * Las referencias pueden escribirse como `nombre` o `@{nombre}`. Si una referencia
 * contiene texto con una expresión (p. ej. un daño "1d8+3"), se evalúa también.
 */

export type ExprValue = number | string;

export interface DiceRoll {
  /** Expresión del grupo, p. ej. "2d20kh1". */
  expr: string;
  /** Todos los resultados. */
  results: number[];
  /** Índices de los dados que cuentan (con kh/kl no cuentan todos). */
  kept: number[];
  sides: number;
}

export interface EvalOptions {
  /** Devuelve el valor de una referencia, o undefined si no existe. */
  resolve?: (name: string) => unknown;
  /** Si se pasa, se permiten dados. Por defecto, dados prohibidos (fórmulas de hoja). */
  rng?: () => number;
}

export interface EvalResult {
  value: number;
  rolls: DiceRoll[];
}

export class ExprError extends Error {}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'dice'; count: number; sides: number; keep: { mode: 'h' | 'l'; n: number } | null; raw: string }
  | { t: 'op'; v: string };

const MAX_DICE = 200;
const MAX_SIDES = 1000;
const MAX_DEPTH = 8;

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    const dice = /^(\d*)[dD](\d+)(?:k([hl]?)(\d+))?/.exec(rest);
    if (dice) {
      const count = dice[1] === '' ? 1 : Number(dice[1]);
      const sides = Number(dice[2]);
      const keep = dice[4] ? { mode: (dice[3] || 'h') as 'h' | 'l', n: Number(dice[4]) } : null;
      // Evita confundir con identificadores como "d20_bonus": no puede seguir una letra o "_".
      if (!/^[A-Za-z_]/.test(rest.slice(dice[0].length))) {
        out.push({ t: 'dice', count, sides, keep, raw: dice[0] });
        i += dice[0].length;
        continue;
      }
    }
    const num = /^\d+(\.\d+)?/.exec(rest);
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const ref = /^@\{([^}]+)\}/.exec(rest);
    if (ref) {
      out.push({ t: 'id', v: ref[1]!.trim() });
      i += ref[0].length;
      continue;
    }
    const id = /^[A-Za-z_À-ſ][A-Za-z0-9_À-ſ]*/.exec(rest);
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    const str = /^"([^"]*)"|^'([^']*)'/.exec(rest);
    if (str) {
      out.push({ t: 'str', v: str[1] ?? str[2] ?? '' });
      i += str[0].length;
      continue;
    }
    const op = /^(<=|>=|==|!=|&&|\|\||[-+*/%(),<>!])/.exec(rest);
    if (op) {
      out.push({ t: 'op', v: op[0] });
      i += op[0].length;
      continue;
    }
    throw new ExprError(tr('Carácter no válido: "{c}"', { c }));
  }
  return out;
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ref'; name: string }
  | { k: 'dice'; tok: Extract<Token, { t: 'dice' }> }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

/** Paréntesis y signos anidados como mucho: más es un error claro, no desbordar la pila. */
const MAX_NESTING = 64;

function parse(tokens: Token[]): Node {
  let pos = 0;
  let nesting = 0;
  const enter = () => {
    if (++nesting > MAX_NESTING) throw new ExprError(tr('Expresión demasiado anidada'));
  };
  const peek = () => tokens[pos];
  const isOp = (v: string) => {
    const t = peek();
    return t?.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(tr('Se esperaba "{v}"', { v }));
    pos++;
  };

  function primary(): Node {
    enter();
    try {
      return primaryInner();
    } finally {
      nesting--;
    }
  }

  function primaryInner(): Node {
    const t = tokens[pos++];
    if (!t) throw new ExprError(tr('Expresión incompleta'));
    switch (t.t) {
      case 'num':
        return { k: 'num', v: t.v };
      case 'str':
        return { k: 'str', v: t.v };
      case 'dice':
        return { k: 'dice', tok: t };
      case 'id':
        if (isOp('(')) {
          pos++;
          const args: Node[] = [];
          if (!isOp(')')) {
            do args.push(expr(0));
            while (isOp(',') && ++pos);
          }
          expect(')');
          return { k: 'call', fn: t.v.toLowerCase(), args };
        }
        return { k: 'ref', name: t.v };
      case 'op':
        if (t.v === '(') {
          const e = expr(0);
          expect(')');
          return e;
        }
        if (t.v === '-' || t.v === '+' || t.v === '!') return { k: 'un', op: t.v, a: primary() };
    }
    throw new ExprError(tr('Expresión no válida'));
  }

  function expr(minPrec: number): Node {
    let left = primary();
    for (;;) {
      const t = peek();
      const prec = t?.t === 'op' ? PRECEDENCE[t.v] : undefined;
      if (t?.t !== 'op' || prec === undefined || prec < minPrec) break;
      pos++;
      left = { k: 'bin', op: t.v, a: left, b: expr(prec + 1) };
    }
    return left;
  }

  const root = expr(0);
  if (pos < tokens.length) throw new ExprError(tr('Sobra texto al final de la expresión'));
  return root;
}

const num = (v: ExprValue): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const FUNCS: Record<string, (args: ExprValue[]) => ExprValue> = {
  floor: ([a = 0]) => Math.floor(num(a)),
  ceil: ([a = 0]) => Math.ceil(num(a)),
  round: ([a = 0]) => Math.round(num(a)),
  abs: ([a = 0]) => Math.abs(num(a)),
  min: (a) => (a.length ? Math.min(...a.map(num)) : 0),
  max: (a) => (a.length ? Math.max(...a.map(num)) : 0),
  if: ([c = 0, a = 0, b = 0]) => (truthy(c) ? a : b),
};

const truthy = (v: ExprValue) => (typeof v === 'string' ? v !== '' && v !== '0' && v !== 'false' : v !== 0);

function evaluateNode(node: Node, opts: EvalOptions, rolls: DiceRoll[], depth: number): ExprValue {
  switch (node.k) {
    case 'num':
    case 'str':
      return node.v;
    case 'ref': {
      const raw = opts.resolve?.(node.name);
      if (raw === undefined || raw === null || raw === '') return 0;
      if (typeof raw === 'boolean') return raw ? 1 : 0;
      if (typeof raw === 'number') return raw;
      const s = String(raw).trim();
      if (s !== '' && Number.isFinite(Number(s))) return Number(s);
      // Texto con una expresión dentro (p. ej. daño "1d8+@{fue_mod}"): evaluarla.
      // Una palabra suelta ("sab", "espada") es texto, no una referencia.
      const isWord = /^[A-Za-z_\u00C0-\u017F][A-Za-z0-9_\u00C0-\u017F ]*$/.test(s) && !/^\d*d\d+/i.test(s);
      if (!isWord && depth < MAX_DEPTH) {
        try {
          return evaluateNode(parse(tokenize(s)), opts, rolls, depth + 1);
        } catch {
          return s;
        }
      }
      return s;
    }
    case 'dice': {
      const { count, sides, keep, raw } = node.tok;
      if (!opts.rng) throw new ExprError(tr('Las fórmulas no pueden tirar dados'));
      if (count > MAX_DICE || sides > MAX_SIDES || sides < 1) throw new ExprError(tr('Demasiados dados'));
      const results = Array.from({ length: count }, () => 1 + Math.floor(opts.rng!() * sides));
      let kept = results.map((_, i) => i);
      if (keep) {
        const sorted = [...kept].sort((a, b) => (keep.mode === 'h' ? results[b]! - results[a]! : results[a]! - results[b]!));
        kept = sorted.slice(0, keep.n).sort((a, b) => a - b);
      }
      rolls.push({ expr: raw, results, kept, sides });
      return kept.reduce((s, i) => s + results[i]!, 0);
    }
    case 'un': {
      const a = evaluateNode(node.a, opts, rolls, depth);
      if (node.op === '!') return truthy(a) ? 0 : 1;
      return node.op === '-' ? -num(a) : num(a);
    }
    case 'bin': {
      const a = evaluateNode(node.a, opts, rolls, depth);
      if (node.op === '&&') return truthy(a) ? evaluateNode(node.b, opts, rolls, depth) : a;
      if (node.op === '||') return truthy(a) ? a : evaluateNode(node.b, opts, rolls, depth);
      const b = evaluateNode(node.b, opts, rolls, depth);
      switch (node.op) {
        case '+':
          return num(a) + num(b);
        case '-':
          return num(a) - num(b);
        case '*':
          return num(a) * num(b);
        case '/':
          return num(b) === 0 ? 0 : num(a) / num(b);
        case '%':
          return num(b) === 0 ? 0 : num(a) % num(b);
        case '==':
          return typeof a === 'string' || typeof b === 'string' ? (String(a) === String(b) ? 1 : 0) : a === b ? 1 : 0;
        case '!=':
          return typeof a === 'string' || typeof b === 'string' ? (String(a) !== String(b) ? 1 : 0) : a !== b ? 1 : 0;
        case '<':
          return num(a) < num(b) ? 1 : 0;
        case '<=':
          return num(a) <= num(b) ? 1 : 0;
        case '>':
          return num(a) > num(b) ? 1 : 0;
        case '>=':
          return num(a) >= num(b) ? 1 : 0;
      }
      throw new ExprError(tr('Operador desconocido {op}', { op: node.op }));
    }
    case 'call': {
      const fn = FUNCS[node.fn];
      if (!fn) throw new ExprError(tr('Función desconocida: {fn}', { fn: node.fn }));
      if (node.fn === 'if') {
        const [c, a, b] = node.args;
        const cond = c ? evaluateNode(c, opts, rolls, depth) : 0;
        const branch = truthy(cond) ? a : b;
        return branch ? evaluateNode(branch, opts, rolls, depth) : 0;
      }
      return fn(node.args.map((a) => evaluateNode(a, opts, rolls, depth)));
    }
  }
}

/** Evalúa una expresión. Lanza ExprError si no es válida. */
export function evaluate(src: string, opts: EvalOptions = {}): EvalResult {
  const rolls: DiceRoll[] = [];
  const value = num(evaluateNode(parse(tokenize(src)), opts, rolls, 0));
  return { value: Math.round(value * 1000) / 1000, rolls };
}

/** Comprueba la sintaxis sin evaluar (para el editor de plantillas). Devuelve el error o null. */
/**
 * Separa "1d20+5 Ataque con espada" (o un daño "1d6 fuego") en tirada y etiqueta: la tirada
 * es el principio más largo que es una expresión válida.
 */
export function splitRoll(rest: string): { expression: string; label: string } {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  for (let n = words.length; n > 0; n--) {
    const expression = words.slice(0, n).join(' ');
    if (!checkSyntax(expression)) return { expression, label: words.slice(n).join(' ') };
  }
  return { expression: '', label: '' };
}

export function checkSyntax(src: string): string | null {
  try {
    parse(tokenize(src));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Nombres a los que hace referencia una expresión. */
export function referencedNames(src: string): string[] {
  try {
    return [...new Set(tokenize(src).flatMap((t) => (t.t === 'id' ? [t.v] : [])))].filter((n) => !(n.toLowerCase() in FUNCS));
  } catch {
    return [];
  }
}
