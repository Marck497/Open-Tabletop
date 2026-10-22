import { useEffect, useState } from 'react';
import type { InitiativeAction, InitiativeEntry, InitiativeState } from '@vtt/shared';
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
  const items = useBoard((s) => s.items);
  const [acting, setActing] = useState(false);
  const act = (action: InitiativeAction) => emitAck('initiative:action', { campaignId, ...action }).catch((e: Error) => alert(e.message));
  const aiAct = () => {
    setActing(true);
    emitAck('ai:act', { campaignId })
      .catch((e: Error) => alert(e.message))
      .finally(() => setActing(false));
  };

  if (!state) return null;
  const current = state.entries[state.turn];
  const myTurn = state.active && current?.characterId && characters[current.characterId]?.controlledBy.includes(meId);
  // ¿Tiene el jugador algún token en la escena que aún no esté en la lista?
  const mineMissing =
    !isGm &&
    Object.values(items).some(
      (i) =>
        !i.drawing &&
        i.layer !== 'map' &&
        (i.ownerIds.includes(meId) || (i.characterId && characters[i.characterId]?.controlledBy.includes(meId))) &&
        !state.entries.some((e) => e.itemId === i.id || (i.characterId && e.characterId === i.characterId)),
    );
  if (!isGm && state.entries.length === 0 && !mineMissing) return null;

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
    <div className={`initiative card ${collapsed ? 'collapsed' : ''}`} data-tour="initiative">
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
          {isGm && state.active && current?.itemId && items[current.itemId] && (
            <button className="small" disabled={acting} onClick={aiAct} title="Este token juega su turno con la IA: se mueve, ataca y lo anota en el chat">
              {acting ? '🤖 …' : '🤖 Actuar'}
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
          {!isGm && mineMissing && (
            <button className="small primary" onClick={() => void act({ type: 'rollMine' })} title="Tira 1d20 más el bono de iniciativa de tu hoja">
              🎲 Tirar mi iniciativa
            </button>
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
              <Entry key={e.id} entry={e} active={state.active && i === state.turn} isGm={isGm} act={act} ai={isGm && !!(e.itemId && items[e.itemId]?.ai?.enabled)} />
            ))}
            {state.active && state.turn === -1 && <li className="muted">Turno de alguien oculto…</li>}
          </ol>
          {isGm && (
            <div className="row">
              <button
                className="small primary"
                onClick={() => (!state.entries.length || confirm('¿Volver a tirar la iniciativa de todos los tokens de la escena?')) && void act({ type: 'rollAll', scope: 'all' })}
                title="Tira 1d20 + el bono de iniciativa de la hoja de cada token de la escena y los ordena (a igualdad, gana el bono más alto)"
              >
                🎲 Tirar a todos
              </button>
              {state.entries.length > 0 && (
                <button className="ghost small" onClick={() => void act({ type: 'rollAll', scope: 'missing' })} title="Tira solo para los tokens que aún no están en la lista">
                  🎲 Los que faltan
                </button>
              )}
              <button className="ghost small" onClick={() => void act({ type: 'rollAll', scope: 'npcs' })} title="Vuelve a tirar solo la de los enemigos y PNJ">
                🎲 Enemigos
              </button>
            </div>
          )}
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
          {isGm && (
            <div className="row ai-settings">
              <label className="switch" title="Los enemigos con IA juegan su turno solos y pasan al siguiente">
                <input type="checkbox" checked={state.ai.auto} onChange={(e) => void act({ type: 'aiSettings', settings: { auto: e.target.checked } })} />
                🤖 IA automática
              </label>
              <label className="switch" title="Resta el daño de los ataques de la IA a la vida del objetivo">
                <input type="checkbox" checked={state.ai.applyDamage} onChange={(e) => void act({ type: 'aiSettings', settings: { applyDamage: e.target.checked } })} />
                Aplicar daño
              </label>
            </div>
          )}
          {!isGm && state.entries.length === 0 && <p className="muted hint">Tira tu iniciativa para entrar en el combate.</p>}
        </>
      )}
    </div>
  );
}

function Entry({ entry, active, isGm, act, ai }: { entry: InitiativeEntry; active: boolean; isGm: boolean; act: (a: InitiativeAction) => unknown; ai: boolean }) {
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
      <span className="init-name">
        {entry.name}
        {entry.die != null && (
          <small className="muted init-roll" title="Dado + bono de iniciativa">
            {' '}
            ({entry.die}
            {entry.bonus ? ` ${entry.bonus > 0 ? '+' : '−'} ${Math.abs(entry.bonus)}` : ''})
          </small>
        )}
        {ai && <span title="Tiene IA"> 🤖</span>}
      </span>
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

/** Barra arriba del tablero, para todos: de quién es el turno y quién va después. */
export function TurnBanner({ meId }: { meId: string }) {
  const state = useInitiative((s) => s.state);
  const characters = useSheets((s) => s.characters);
  if (!state?.active || !state.entries.length) return null;
  const current = state.entries[state.turn];
  const next = state.entries.length > 1 ? state.entries[(Math.max(0, state.turn) + 1) % state.entries.length] : undefined;
  const mine = !!current?.characterId && !!characters[current.characterId]?.controlledBy.includes(meId);
  return (
    <div className={`turn-banner ${mine ? 'mine' : ''}`} role="status">
      <span className="muted">Ronda {state.round}</span>
      <strong>{mine ? '¡Es tu turno!' : current ? `Turno de ${current.name}` : 'Turno de alguien oculto'}</strong>
      {next && next !== current && <span className="muted">Después: {next.name}</span>}
    </div>
  );
}

const ANNOUNCE_MS = 9000;

/** Al tirar la iniciativa, todos ven el orden de turnos en grande unos segundos. */
export function InitiativeAnnounce({ meId }: { meId: string }) {
  const announce = useInitiative((s) => s.announce);
  const state = useInitiative((s) => s.state);
  const characters = useSheets((s) => s.characters);
  useEffect(() => {
    if (announce <= 0) return;
    const t = setTimeout(() => useInitiative.getState().hideAnnounce(), ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, [announce]);
  if (announce <= 0 || !state?.entries.length) return null;
  return <AnnounceCard state={state} isMine={(e) => !!e.characterId && !!characters[e.characterId]?.controlledBy.includes(meId)} />;
}

function AnnounceCard({ state, isMine }: { state: InitiativeState; isMine: (e: InitiativeEntry) => boolean }) {
  const close = () => useInitiative.getState().hideAnnounce();
  return (
    <div className="initiative-announce card" role="dialog" aria-label="Orden de iniciativa" onClick={close}>
      <h2>⚔️ Orden de iniciativa</h2>
      <ol>
        {state.entries.map((e, i) => (
          <li key={e.id} className={`${isMine(e) ? 'mine' : ''} ${e.hidden ? 'hidden-entry' : ''}`}>
            <span className="place">{i + 1}.</span>
            <span className="who">{e.name}</span>
            <span className="total">{e.value}</span>
            <small className="muted">{e.die != null ? `${e.die}${e.bonus ? ` ${e.bonus > 0 ? '+' : '−'} ${Math.abs(e.bonus)}` : ''}` : ''}</small>
          </li>
        ))}
      </ol>
      <p className="muted hint">Toca para cerrar</p>
    </div>
  );
}
