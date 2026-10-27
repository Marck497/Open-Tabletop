import type { Handout } from '@vtt/shared';
import { api } from '../../core/api';
import { useJournal } from './store';
import { tr } from '../../core/i18n';

/** Pestaña "Diario": lista de documentos. El DM los crea; los jugadores ven los que les comparte. */
export function JournalPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const handouts = useJournal((s) => s.handouts);
  const list = Object.values(handouts).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  async function create() {
    const title = prompt(tr('Título del documento'), tr('Nueva nota'));
    if (!title?.trim()) return;
    const { handout } = await api.post<{ handout: Handout }>(`/campaigns/${campaignId}/handouts`, { title });
    useJournal.getState().upsert(handout);
    useJournal.getState().open(handout.id);
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3>{tr('Diario')}</h3>
        {isGm && (
          <button className="ghost small" onClick={() => void create()}>
            {tr('+ Nuevo')}
          </button>
        )}
      </div>
      {list.length === 0 && (
        <p className="muted hint">{isGm ? tr('Prepara cartas, pistas o mapas y compártelos cuando quieras.') : tr('El DM todavía no te ha enseñado ningún documento.')}</p>
      )}
      <ul className="handout-list">
        {list.map((h) => (
          <li key={h.id}>
            <button className="ghost handout-row" onClick={() => useJournal.getState().open(h.id)}>
              <span>{h.imageAssetId ? '🖼' : '📜'}</span>
              <span className="handout-title">{h.title}</span>
              {isGm && <small className="muted">{h.visibleToAll ? tr('Todos') : h.sharedWith.length ? tr('{length} jug.', { length: h.sharedWith.length }) : tr('Oculto')}</small>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
