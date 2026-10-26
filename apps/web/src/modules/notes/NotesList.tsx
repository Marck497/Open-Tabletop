import { useBoard } from '../board/store';
import { addNote, goToNote, noteNumber, notesOf, readNote, renumberNotes } from './notes';

/** Lista de notas numeradas de la escena abierta (pestaña Escenas, solo el DM). */
export function NotesList({ campaignId }: { campaignId: string }) {
  const items = useBoard((s) => s.items);
  const selectedId = useBoard((s) => s.selectedId);
  const notes = notesOf(items);
  const gaps = notes.some((n, k) => noteNumber(n) !== k + 1);
  return (
    <section className="notes-list" aria-label="Notas del mapa">
      <div className="row spread">
        <strong>📍 Notas del mapa</strong>
        <button className="ghost small" title="Pone la nota siguiente en el centro de la vista (capa del DM): arrástrala a su sitio y escribe su texto" onClick={() => void addNote()}>
          + Nota
        </button>
      </div>
      {!notes.length && <p className="muted hint">Numera los sitios del mapa (1, 2, 3…) con su descripción, como en un módulo de aventura. Los jugadores no las ven.</p>}
      <ul>
        {notes.map((n) => (
          <li key={n.id} className={n.id === selectedId ? 'active' : ''}>
            <button className="note-link" onClick={() => goToNote(n)} title={n.gmNotes || 'Sin texto: selecciónala y escríbelo en su panel'}>
              <span className="note-badge">{noteNumber(n)}</span>
              <span className="note-title">{n.name || `Nota ${noteNumber(n)}`}</span>
              {n.gmNotes && <span className="muted note-text">{n.gmNotes.split('\n')[0]}</span>}
            </button>
            {n.gmNotes && (
              <button className="ghost small" title="Leer en el chat: manda su título y texto a todos" onClick={() => void readNote(campaignId, n)}>
                📣
              </button>
            )}
          </li>
        ))}
      </ul>
      {gaps && (
        <button className="ghost small" onClick={() => void renumberNotes()} title="Vuelve a numerarlas 1, 2, 3… sin huecos">
          Renumerar
        </button>
      )}
    </section>
  );
}
