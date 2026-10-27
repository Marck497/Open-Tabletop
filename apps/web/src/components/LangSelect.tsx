import { LANG_LABELS, LANGS, type Lang } from '@vtt/shared';
import { lang, setLang, tr } from '../core/i18n';

/** Selector del idioma de la interfaz (se guarda en este navegador). */
export function LangSelect() {
  return (
    <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={tr('Idioma')} title={tr('Idioma')}>
      {LANGS.map((l) => (
        <option key={l} value={l}>
          🌐 {LANG_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
