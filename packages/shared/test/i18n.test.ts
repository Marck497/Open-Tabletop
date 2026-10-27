import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatText, translate } from '../src/index.js';
import { EN } from '../src/i18n/en.js';

const ROOT = join(import.meta.dirname, '../../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Los textos fijos que el código pasa a tr('…'). */
function trKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const dir of ['apps/web/src', 'packages/shared/src', 'apps/server/src']) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      if (file.includes('/i18n/')) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        const key = m[1]!.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        if (!keys.has(key)) keys.set(key, file.slice(ROOT.length + 1));
      }
    }
  }
  return keys;
}

describe('traducciones', () => {
  it('todos los textos de tr() tienen su versión en inglés', () => {
    const missing = [...trKeys()].filter(([key]) => !(key in EN)).map(([key, file]) => `${file}: ${key}`);
    expect(missing).toEqual([]);
  });

  it('los errores fijos del servidor tienen su versión en inglés (la web los traduce al recibirlos)', () => {
    const errors = new Set<string>();
    for (const file of sourceFiles(join(ROOT, 'apps/server/src'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\b(?:badRequest|notFound|forbidden|conflict|unauthorized)\(\s*'([^']*)'|\berror: '([^']*)'|\bmsg = '([^']*)'/g)) {
        errors.add((m[1] ?? m[2] ?? m[3])!);
      }
    }
    expect([...errors].filter((e) => !(e in EN))).toEqual([]);
  });

  it('los errores del servidor no meten datos con `…${}`: van en huecos {…} para poder traducirlos', () => {
    const wrong: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'apps/server/src'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\b(?:badRequest|notFound|forbidden|conflict|unauthorized)\(\s*`([^`]*)`/g)) wrong.push(`${file.slice(ROOT.length + 1)}: ${m[1]}`);
    }
    expect(wrong).toEqual([]);
  });

  it('las traducciones no usan huecos {…} que el original no tiene', () => {
    const wrong = Object.entries(EN).filter(([es, en]) => (en.match(/(?<!@)\{\w+\}/g) ?? []).some((p) => !es.includes(p)));
    expect(wrong).toEqual([]);
  });

  it('traduce, rellena huecos y deja igual lo que no conoce', () => {
    expect(translate('en', 'Guardar')).toBe('Save');
    expect(translate('es', 'Guardar')).toBe('Guardar');
    expect(translate('en', 'Turno de {name}', { name: 'Ana' })).toBe("Ana's turn");
    expect(translate('en', 'Mi partida de los martes')).toBe('Mi partida de los martes');
    expect(formatText('{a} y {b}', { a: 1 })).toBe('1 y {b}');
  });
});
