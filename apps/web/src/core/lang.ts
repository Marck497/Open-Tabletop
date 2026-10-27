// Se importa lo primero en main.tsx: decide el idioma antes de que se cargue @vtt/shared,
// cuyas etiquetas fijas se traducen al cargarse. Por eso no importa nada.
export const LANG_KEY = 'vtt.lang';

function initialLang(): string {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    // sin localStorage: se decide por el navegador
  }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

const lang = initialLang();
(globalThis as { __VTT_LANG__?: string }).__VTT_LANG__ = lang;
document.documentElement.lang = lang;
