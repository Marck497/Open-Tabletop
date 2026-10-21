import { useState } from 'react';
import type { InitiativeAction, InitiativeEntry } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { useBoard } from '../board/store';
import { useSheets } from '../sheets/store';
import { useInitiative } from './store';

interface Props {
  campaignId: string;
  isGm: boolean;
  meId: string;
}

/** Orden de iniciativa, flotando sobre el tablero. */
export function InitiativeTracker({ campaignId, isGm, meId }: Props) {
  const state = useInitiative((s) => s.state);
  const characters = useSheets((s) => s.characters);
  const [collapsed, setCollapsed] = useState(false);
  const act = (action: InitiativeAction) => emitAck('initiative:action', { campaignId, ...action }).catch((e: Error) => alert(e.message));

  if (!state || (!isGm && state.entries.length === 0)) return null;
  const current = state.entries[state.turn];
  const myTurn = state.active && current?.characterId && characters[current.characterId]?.controlledBy.includes(meId);

  function addSelected() {
    const { selectedId, items } = useBoard.getState();
    const item = selectedId ? items[selectedId] : undefined;
    if (!item) return alert('Selecciona primero un token en el tablero');
    const name = item.name || (item.characterId && characters[item.characterId]?.name) || 'Token';
    const value = Number(prompt(`Iniciativa de ${name}`, '10'));
    if (Number.isNaN(value)) return;
    void act({ type: 'add', entry: { name, value, itemId: item.id, characterId: item.characterId, hidden: item.layer === 'gm' } });
  }

  function addManual() {
    const name = prompt('Nombre');
    if (!name) return;
    const value = Number(prompt(`Iniciativa de ${name}`, '10'));
    if (!Number.isNaN(value)) void act({ type: 'add', entry: { name, value, itemId: null, characterId: null, hidden: false } });
  }

  return (
    <div className={`initiative card ${collapsed ? 'collapsed' : ''}`}>
      <div className="initiative-head">
        <button className="ghost small" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Mostrar' : 'Ocultar'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <strong>Iniciativa</strong>
        {state.active && <span className="muted">Ronda {state.round}</span>}
        <span className="row end">
          {isGm && !state.active && state.entries.length > 0 && (
            <button className="small primary" onClick={() => void act({ type: 'start' })}>
              Empezar
            </button>
          )}
          {isGm && state.active && (
            <>
              <button className="ghost small" onClick={() => void act({ type: 'prev' })} title="Turno anterior">
                ◀
              </button>
              <button className="small primary" onClick={() => void act({ type: 'next' })}>
                Siguiente ▶
              </button>
            </>
          )}
          {!isGm && myTurn && (
            <button className="small primary" onClick={() => void act({ type: 'next' })}>
              Terminar mi turno
            </button>
          )}
        </span>
      </div>
      {!collapsed && (
        <>
          <ol className="initiative-list">
            {state.entries.map((e, i) => (
              <Entry key={e.id} entry={e} active={state.active && i === state.turn} isGm={isGm} act={act} />
            ))}
            {state.active && state.turn === -1 && <li className="muted">Turno de alguien oculto…</li>}
          </ol>
          {isGm && (
            <div className="row">
              <button className="ghost small" onClick={addSelected} title="Añade el token seleccionado">
                + Token seleccionado
              </button>
              <button className="ghost small" onClick={addManual}>
                + Otro
              </button>
              <button className="ghost small" onClick={() => void act({ type: 'sort' })}>
                Ordenar
              </button>
              {state.active && (
                <button className="ghost small" onClick={() => void act({ type: 'end' })}>
                  Fin del combate
                </button>
              )}
              <button className="ghost small danger" onClick={() => confirm('¿Vaciar la iniciativa?') && void act({ type: 'clear' })}>
                Vaciar
              </button>
            </div>
          )}
          {!isGm && <p className="muted hint">Tira iniciativa desde tu hoja para entrar.</p>}
        </>
      )}
    </div>
  );
}

function Entry({ entry, active, isGm, act }: { entry: InitiativeEntry; active: boolean; isGm: boolean; act: (a: InitiativeAction) => unknown }) {
  return (
    <li
      className={`${active ? 'active' : ''} ${entry.hidden ? 'hidden-entry' : ''}`}
      onClick={() => entry.itemId && useBoard.getState().items[entry.itemId] && useBoard.getState().select(entry.itemId)}
    >
      <span className="init-value">
        {isGm ? (
          <input
            type="number"
            defaultValue={entry.value}
            key={entry.value}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => Number(e.target.value) !== entry.value && act({ type: 'update', id: entry.id, patch: { value: Number(e.target.value) } })}
          />
        ) : (
          entry.value
        )}
      </span>
      <span className="init-name">{entry.name}</span>
      {isGm && (
        <span className="row end" onClick={(e) => e.stopPropagation()}>
          <button className="ghost small" title={entry.hidden ? 'Mostrar a los jugadores' : 'Ocultar a los jugadores'} onClick={() => act({ type: 'update', id: entry.id, patch: { hidden: !entry.hidden } })}>
            {entry.hidden ? '🙈' : '👁'}
          </button>
          <button className="ghost small danger" title="Quitar" onClick={() => act({ type: 'remove', id: entry.id })}>
            ✕
          </button>
        </span>
      )}
    </li>
  );
}
