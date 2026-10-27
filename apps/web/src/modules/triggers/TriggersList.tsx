import { TRIGGER_ICONS } from '@vtt/shared';
import { useBoard } from '../board/store';
import { addTrigger, rearm, triggersOf } from './triggers';
import { tr } from '../../core/i18n';

/** Lista de trampas y zonas de aviso de la escena abierta (pestaña Escenas, solo el DM). */
export function TriggersList() {
  const items = useBoard((s) => s.items);
  const selectedId = useBoard((s) => s.selectedId);
  const list = triggersOf(items);
  return (
    <section className="notes-list" aria-label={tr('Trampas y zonas')}>
      <div className="row spread">
        <strong>{tr('🪤 Trampas y zonas')}</strong>
        <span className="row">
          <button className="ghost small" title={tr('Trampa: al entrar un token, tira la salvación y el daño que pongas y se lo aplica')} onClick={() => void addTrigger('trap')}>
            {tr('+ Trampa')}
          </button>
          <button className="ghost small" title={tr('Zona de aviso: te avisa cuando un token entra (y, si quieres, cuenta algo o descubre una emboscada escondida)')} onClick={() => void addTrigger('zone')}>
            {tr('+ Zona')}
          </button>
        </span>
      </div>
      {!list.length && <p className="muted hint">{tr('Saltan solas cuando un token entra en ellas. Los jugadores no las ven.')}</p>}
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
              <span className="note-title">{t.name || tr('Sin nombre')}</span>
              {!t.trigger!.active && <span className="muted note-text">{tr('ya saltó')}</span>}
            </button>
            {!t.trigger!.active && (
              <button className="ghost small" title={tr('Volver a armarla')} onClick={() => void rearm(t)}>
                {tr('Rearmar')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
