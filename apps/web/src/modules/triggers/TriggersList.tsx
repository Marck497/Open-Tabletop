import { TRIGGER_ICONS } from '@vtt/shared';
import { useBoard } from '../board/store';
import { addTrigger, rearm, triggersOf } from './triggers';

/** Lista de trampas y zonas de aviso de la escena abierta (pestaña Escenas, solo el DM). */
export function TriggersList() {
  const items = useBoard((s) => s.items);
  const selectedId = useBoard((s) => s.selectedId);
  const list = triggersOf(items);
  return (
    <section className="notes-list" aria-label="Trampas y zonas">
      <div className="row spread">
        <strong>🪤 Trampas y zonas</strong>
        <span className="row">
          <button className="ghost small" title="Trampa: al entrar un token, tira la salvación y el daño que pongas y se lo aplica" onClick={() => void addTrigger('trap')}>
            + Trampa
          </button>
          <button className="ghost small" title="Zona de aviso: te avisa cuando un token entra (y, si quieres, cuenta algo o descubre una emboscada escondida)" onClick={() => void addTrigger('zone')}>
            + Zona
          </button>
        </span>
      </div>
      {!list.length && <p className="muted hint">Saltan solas cuando un token entra en ellas. Los jugadores no las ven.</p>}
      <ul>
        {list.map((t) => (
          <li key={t.id} className={t.id === selectedId ? 'active' : ''}>
            <button
              className="note-link"
              onClick={() => {
                useBoard.setState({ focus: { x: t.x + t.width / 2, y: t.y + t.height / 2, n: Date.now() } });
                useBoard.getState().select(t.id);
              }}
            >
              <span>{TRIGGER_ICONS[t.trigger!.kind]}</span>
              <span className="note-title">{t.name || 'Sin nombre'}</span>
              {!t.trigger!.active && <span className="muted note-text">ya saltó</span>}
            </button>
            {!t.trigger!.active && (
              <button className="ghost small" title="Volver a armarla" onClick={() => void rearm(t)}>
                Rearmar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
