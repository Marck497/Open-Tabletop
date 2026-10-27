import { LANG_LABELS, LANGS, type Lang } from '@vtt/shared';
import { api } from '../../core/api';
import { tr } from '../../core/i18n';

/** Idioma de la partida: el de lo que escribe el servidor (chat, escenas nuevas, aventuras…). */
export function CampaignLangPanel({ campaignId, lang }: { campaignId: string; lang: Lang }) {
  return (
    <div className="panel">
      <h3>{tr('Idioma de la partida')}</h3>
      <select value={lang} onChange={(e) => void api.patch(`/campaigns/${campaignId}`, { lang: e.target.value })}>
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_LABELS[l]}
          </option>
        ))}
      </select>
      <p className="muted hint">{tr('Es el idioma de los mensajes del chat (tiradas, daño, IA…), de las escenas nuevas y de las aventuras generadas. Cada uno elige el de los botones arriba a la derecha o en Mesa → Efectos.')}</p>
    </div>
  );
}
