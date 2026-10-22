import { useEffect, useState } from 'react';
import { LIGHT_PRESETS, statusesOf } from '@vtt/shared';
import { useSheets } from '../sheets/store';
import { updateSelected } from './actions';
import { useBoard } from './store';

/**
 * Estados del token seleccionado: el DM los cambia en cualquiera; un jugador, en los suyos.
 * Clic derecho en un estado puesto: cuántas rondas dura (se quita solo al empezar su turno en la iniciativa).
 */
export function StatusBar({ isGm, meId }: { isGm: boolean; meId: string }) {
  const item = useBoard((s) => (s.selectedId ? s.items[s.selectedId] : undefined));
  const template = useSheets((s) => s.template);
  /** Estado al que se le está poniendo duración. */
  const [timing, setTiming] = useState<string | null>(null);
  useEffect(() => setTiming(null), [item?.id]);
  if (!item || item.layer === 'map' || item.drawing || !(isGm || item.ownerIds.includes(meId))) return null;
  const defs = statusesOf(template);
  const scene = useBoard.getState().scene;
  const torch = LIGHT_PRESETS.find((p) => p.label === 'Antorcha')!.light;
  const toggle = (id: string) =>
    void updateSelected({ statuses: item.statuses.includes(id) ? item.statuses.filter((s) => s !== id) : [...item.statuses, id] });
  const setRounds = (id: string, n: number | null) => {
    const { [id]: _, ...rest } = item.statusRounds;
    void updateSelected({ statusRounds: n ? { ...rest, [id]: n } : rest, ...(item.statuses.includes(id) ? {} : { statuses: [...item.statuses, id] }) });
  };
  const timed = timing ? defs.find((d) => d.id === timing) : undefined;

  return (
    <div className="status-bar card" role="toolbar" aria-label="Estados">
      {defs.map((d) => {
        const on = item.statuses.includes(d.id);
        const left = item.statusRounds[d.id];
        return (
          <button
            key={d.id}
            className={`status-btn ${d.kind ?? ''} ${on ? 'on' : ''}`}
            title={`${d.label}${d.kind === 'buff' ? ' (bufo)' : ''}${d.incapacitated ? ' (no puede actuar)' : ''}${left ? ` — quedan ${left} rondas` : ''}\nClic derecho: duración en rondas`}
            aria-pressed={on}
            onClick={() => toggle(d.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTiming(timing === d.id ? null : d.id);
            }}
          >
            {d.icon}
            {left ? <span className="status-rounds">{left}</span> : null}
          </button>
        );
      })}
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
      {timed && (
        <div className="status-timer">
          ⏳ {timed.icon} {timed.label}:
          {[1, 2, 3, 10].map((n) => (
            <button key={n} className={`small ${item.statusRounds[timed.id] === n ? 'active' : ''}`} onClick={() => setRounds(timed.id, n)}>
              {n === 10 ? '1 min (10)' : n}
            </button>
          ))}
          <input
            type="number"
            className="tiny-number"
            min={1}
            max={1000}
            placeholder="n"
            title="Otro número de rondas"
            onKeyDown={(e) => {
              const n = Math.round(Number((e.target as HTMLInputElement).value));
              if (e.key === 'Enter' && n >= 1 && n <= 1000) setRounds(timed.id, n);
            }}
          />
          <button className="ghost small" onClick={() => setRounds(timed.id, null)}>
            Sin límite
          </button>
          <button className="ghost small" onClick={() => setTiming(null)} aria-label="Cerrar">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
