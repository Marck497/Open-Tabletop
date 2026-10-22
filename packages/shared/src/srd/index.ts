import type { SrdData } from './types.js';

export * from './types.js';
export * from './character.js';

let cache: Promise<SrdData> | null = null;

/** Carga los datos del SRD (unos 800 KB): en la web van en un archivo aparte que se baja al abrir el creador o el compendio. */
export function loadSrd(): Promise<SrdData> {
  cache ??= import('./data.json').then((m) => m.default as unknown as SrdData);
  return cache;
}
