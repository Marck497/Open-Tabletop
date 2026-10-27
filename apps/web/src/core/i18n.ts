import { uiLang, type Lang } from '@vtt/shared';
import { LANG_KEY } from './lang';

/** `tr('Guardar')` traduce un texto de la interfaz (escrito en español) al idioma elegido. */
export { tr, uiLang as lang } from '@vtt/shared';

/** Cambiar de idioma recarga la página: así todo, también las etiquetas fijas, sale ya traducido. */
export function setLang(next: Lang) {
  if (next === uiLang) return;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    return; // sin poder guardarlo, al recargar volvería al idioma anterior
  }
  location.reload();
}
