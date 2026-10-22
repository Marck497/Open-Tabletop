import { LIGHT_PRESETS, statusesOf } from '@vtt/shared';
import { useSheets } from '../sheets/store';
import { updateSelected } from './actions';
import { useBoard } from './store';

/** Estados del token seleccionado: el DM los cambia en cualquiera; un jugador, en los suyos. */
export function StatusBar({ isGm, meId }: { isGm: boolean; meId: string }) {
  const item = useBoard((s) => (s.selectedId ? s.items[s.selectedId] : undefined));
  const template = useSheets((s) => s.template);
  if (!item || item.layer === 'map' || item.drawing || !(isGm || item.ownerIds.includes(meId))) return null;
  const defs = statusesOf(template);
  const scene = useBoard.getState().scene;
  const torch = LIGHT_PRESETS.find((p) => p.label === 'Antorcha')!.light;
  const toggle = (id: string) =>
    void updateSelected({ statuses: item.statuses.includes(id) ? item.statuses.filter((s) => s !== id) : [...item.statuses, id] });

  return (
    <div className="status-bar card" role="toolbar" aria-label="Estados">
      {defs.map((d) => (
        <button
          key={d.id}
          className={`status-btn ${d.kind ?? ''} ${item.statuses.includes(d.id) ? 'on' : ''}`}
          title={`${d.label}${d.kind === 'buff' ? ' (bufo)' : ''}${d.incapacitated ? ' (no puede actuar)' : ''}`}
          aria-pressed={item.statuses.includes(d.id)}
          onClick={() => toggle(d.id)}
        >
          {d.icon}
        </button>
      ))}
      {scene?.vision && scene.lighting && (
        <button
          className={`status-btn buff ${item.light ? 'on' : ''}`}
          title={item.light ? 'Apagar la luz' : 'Encender una antorcha'}
          aria-pressed={!!item.light}
          onClick={() => void updateSelected({ light: item.light ? null : torch })}
        >
          🔥
        </button>
      )}
    </div>
  );
}
