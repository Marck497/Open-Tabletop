import { AsyncLocalStorage } from 'node:async_hooks';
import { setLangResolver, type Lang } from '@vtt/shared';

/**
 * Idioma de la partida con la que se está trabajando. Lo fija `requireMember` (y la creación
 * de la partida), y `tr()` de @vtt/shared lo usa para lo que escribe el servidor: chat, escenas
 * nuevas, notas de las aventuras… Sin partida, español.
 */
const store = new AsyncLocalStorage<Lang>();
setLangResolver(() => store.getStore());

export function enterLang(lang: Lang): void {
  store.enterWith(lang);
}
