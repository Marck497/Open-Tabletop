import { useBoard } from '../board/store';
import { addNote, goToNote, noteNumber, notesOf, readablePart, readNote, renumberNotes } from './notes';
import { tr } from '../../core/i18n';

/** Lista de notas numeradas de la escena abierta (pestaña Escenas, solo el DM). */
export function NotesList({ campaignId }: { campaignId: string }) {
  const items = useBoard((s) => s.items);
  const selectedId = useBoard((s) => s.selectedId);
  const notes = notesOf(items);
  const gaps = notes.some((n, k) => noteNumber(n) !== k + 1);
  return (
    <section className="notes-list" aria-label={tr('Notas del mapa')}>
      <div className="row spread">
        <strong>{tr('📍 Notas del mapa')}</strong>
        <button className="ghost small" title={tr('Pone la nota siguiente en el centro de la vista (capa del DM): arrástrala a su sitio y escribe su texto')} onClick={() => void addNote()}>
          {tr('+ Nota')}
        </button>
      </div>
      {!notes.length && <p className="muted hint">{tr('Numera los sitios del mapa (1, 2, 3…) con su descripción, como en un módulo de aventura. Los jugadores no las ven.')}</p>}
      <ul>
        {notes.map((n) => (
          <li key={n.id} className={n.id === selectedId ? 'active' : ''}>
            <button className="note-link" onClick={() => goToNote(n)} title={n.gmNotes || tr('Sin texto: selecciónala y escríbelo en su panel')}>
              <span className="note-badge">{noteNumber(n)}</span>
              <span className="note-title">{n.name || tr('Nota {0}', { '0': noteNumber(n) })}</span>
              {n.gmNotes && <span className="muted note-text">{n.gmNotes.split('\n')[0]}</span>}
            </button>
            {readablePart(n) && (
              <button className="ghost small" title={tr('Leer en el chat: manda su título y la parte para leer (lo de antes de ---) a todos')} onClick={() => void readNote(campaignId, n)}>
                📣
              </button>
            )}
          </li>
        ))}
      </ul>
      {gaps && (
        <button className="ghost small" onClick={() => void renumberNotes()} title={tr('Vuelve a numerarlas 1, 2, 3… sin huecos')}>
          {tr('Renumerar')}
        </button>
      )}
    </section>
  );
}
