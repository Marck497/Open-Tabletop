import { EN } from './en.js';

/**
 * Traducciones. El texto original (en español) es la clave: `translate('en', 'Guardar')` → "Save".
 * Lo que no está en el diccionario se devuelve tal cual, así que los textos propios de cada mesa
 * (nombres, plantillas editadas…) no se tocan.
 */
export const LANGS = ['es', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABELS: Record<Lang, string> = { es: 'Español', en: 'English' };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * Idioma de la interfaz. La web lo deja en `globalThis.__VTT_LANG__` antes de cargar este paquete
 * (ver `apps/web/src/core/lang.ts`), así que las etiquetas fijas de aquí ya salen traducidas.
 * En el servidor no está y se queda en español.
 */
const requested = (globalThis as { __VTT_LANG__?: unknown }).__VTT_LANG__;
export const uiLang: Lang = isLang(requested) ? requested : 'es';

export type TextVars = Record<string, string | number | boolean | null | undefined>;

const DICTS: Record<Lang, Record<string, string> | null> = { es: null, en: EN };

/** Sustituye `{nombre}` por su valor. */
export function formatText(text: string, vars?: TextVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, text: string, vars?: TextVars): string {
  return formatText(DICTS[lang]?.[text] ?? text, vars);
}


let resolveLang: (() => Lang | undefined) | null = null;

/** El servidor indica aquí de dónde sacar el idioma de cada petición (el de su partida). */
export function setLangResolver(fn: () => Lang | undefined) {
  resolveLang = fn;
}

/** Idioma actual: el de la interfaz en la web, el de la partida en el servidor. */
export function currentLang(): Lang {
  return resolveLang?.() ?? uiLang;
}

/** Nombre de algo del SRD o del compendio, que guardan el original en inglés en `en`. */
export function localName(x: { name: string; en?: string }): string {
  return currentLang() === 'en' && x.en ? x.en : x.name;
}

/** Traduce un texto al idioma actual: el de la interfaz en la web, el de la partida en el servidor. */
export function tr(text: string, vars?: TextVars): string {
  return translate(currentLang(), text, vars);
}
