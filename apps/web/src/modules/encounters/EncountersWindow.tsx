import { useEffect, useMemo, useState } from 'react';
import {
  localName,
  crValue,
  DIFFICULTY_LABELS,
  monsterById,
  MONSTERS,
  rateEncounter,
  suggestEncounter,
  xpOfCr,
  type Difficulty,
  type Encounter,
  type EncounterMonster,
} from '@vtt/shared';
import { api } from '../../core/api';
import { useBoard } from '../board/store';
import { useSheets } from '../sheets/store';
import { lang, tr } from '../../core/i18n';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PARTY_KEY = (campaignId: string) => `vtt:encounters:party:${campaignId}`;

/** "4 × Goblin, Lobo" */
export const monstersSummary = (list: EncounterMonster[]) =>
  list
    .map((m) => {
      const def = monsterById(m.monsterId);
      const name = def ? localName(def) : m.monsterId;
      return m.count > 1 ? `${m.count} × ${name}` : name;
    })
    .join(', ') || tr('Sin monstruos');

function DifficultyBadge({ difficulty, xp }: { difficulty: Difficulty; xp: number }) {
  return (
    <span className={`badge difficulty-${difficulty}`} title={tr('{xp} PX ajustados para el grupo', { xp })}>
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}

/** El grupo con el que se mide la dificultad: los PJ de la partida (con dueño) y su nivel, o lo que escriba el DM. */
export function useParty(campaignId: string) {
  const characters = useSheets((s) => s.characters);
  const detected = useMemo(
    () =>
      Object.values(characters)
        .filter((c) => c.controlledBy.length > 0)
        .map((c) => Math.max(1, Math.min(20, Math.round(Number(c.values.nivel)) || 1))),
    [characters],
  );
  const [manual, setManual] = useState<{ size: number; level: number } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(PARTY_KEY(campaignId)) ?? 'null');
    } catch {
      return null;
    }
  });
  const save = (value: { size: number; level: number } | null) => {
    setManual(value);
    try {
      if (value) localStorage.setItem(PARTY_KEY(campaignId), JSON.stringify(value));
      else localStorage.removeItem(PARTY_KEY(campaignId));
    } catch {
      /* sin almacenamiento */
    }
  };
  const levels = manual ? Array.from({ length: manual.size }, () => manual.level) : detected.length ? detected : [1, 1, 1, 1];
  return { levels, detected, manual, save };
}

/** Encuentros preparados (solo el DM): guardar grupos de monstruos, ver su dificultad y soltarlos en el tablero. */
export function EncountersWindow({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [list, setList] = useState<Encounter[] | null>(null);
  const [editing, setEditing] = useState<Encounter | 'new' | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const scene = useBoard((s) => s.scene);
  const party = useParty(campaignId);

  const load = () =>
    api
      .get<{ encounters: Encounter[] }>(`/campaigns/${campaignId}/encounters`)
      .then((r) => setList(r.encounters))
      .catch((e: Error) => setMessage(e.message));
  useEffect(() => void load(), [campaignId]);

  async function run(work: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const done = await work();
      if (done) setMessage(done);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const deploy = (e: Encounter) =>
    run(async () => {
      const { scene: current, viewCenter } = useBoard.getState();
      if (!current) return tr('Abre una escena primero.');
      const res = await api.post<{ characters: number }>(`/encounters/${e.id}/deploy`, { sceneId: current.id, x: viewCenter.x, y: viewCenter.y, hidden });
      return tr('«{name}»: {characters} {2} en «{name2}»{4}, con su hoja y la IA activada.', { name: e.name, characters: res.characters, '2': res.characters === 1 ? tr('monstruo') : tr('monstruos'), name2: current.name, '4': hidden ? tr(', escondidos en la capa del DM') : '' });
    });

  const remove = (e: Encounter) => {
    if (confirm(tr('¿Borrar el encuentro «{name}»? Los monstruos que ya soltaste no se borran.', { name: e.name })))
      void run(async () => {
        await api.delete(`/encounters/${e.id}`);
        await load();
      });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal encounters" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Encuentros preparados')}>
        <div className="row spread">
          <h2>{tr('⚔ Encuentros preparados')}</h2>
          <button className="ghost small" onClick={onClose} title={tr('Cerrar')}>
            ✕
          </button>
        </div>
        <PartyLine party={party} />
        {message && <p className="notice-line">{message}</p>}

        {editing ? (
          <EncounterEditor
            campaignId={campaignId}
            initial={editing === 'new' ? null : editing}
            levels={party.levels}
            onDone={(saved) => {
              setEditing(null);
              if (saved) {
                setMessage(tr('«{name}» guardado.', { name: saved.name }));
                void load();
              }
            }}
          />
        ) : (
          <>
            <div className="row spread">
              <label className="switch" title={tr('Los pone en la capa del DM: los jugadores no los ven hasta que los pases a la de tokens')}>
                <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
                {tr('Soltarlos escondidos (capa del DM)')}
              </label>
              <button className="small primary" onClick={() => setEditing('new')}>
                {tr('+ Nuevo encuentro')}
              </button>
            </div>
            {list === null ? (
              <p className="muted">{tr('Cargando…')}</p>
            ) : list.length === 0 ? (
              <p className="muted">{tr('Aún no hay encuentros. Crea uno con los monstruos del compendio y suéltalo en el tablero con un clic cuando llegue el momento.')}</p>
            ) : (
              <ul className="encounter-list">
                {list.map((e) => {
                  const rating = rateEncounter(e.monsters, party.levels);
                  return (
                    <li key={e.id} className="encounter-row">
                      <div className="row spread">
                        <span className="encounter-name">
                          <strong>{e.name}</strong> <DifficultyBadge difficulty={rating.difficulty} xp={rating.adjustedXp} /> <small className="muted">{rating.xp} {tr('PX')}</small>
                        </span>
                        <span className="row">
                          <button
                            className="small primary"
                            disabled={busy || !scene || !e.monsters.length}
                            onClick={() => void deploy(e)}
                            title={scene ? tr('Crea las hojas y pone los tokens en «{name}», donde estás mirando', { name: scene.name }) : tr('Abre una escena primero')}
                          >
                            {tr('▶ Al tablero')}
                          </button>
                          <button className="ghost small" disabled={busy} onClick={() => setEditing(e)} title={tr('Editar')}>
                            ✎
                          </button>
                          <button className="ghost small danger" disabled={busy} onClick={() => remove(e)} title={tr('Borrar')}>
                            ✕
                          </button>
                        </span>
                      </div>
                      <div className="muted encounter-monsters">{monstersSummary(e.monsters)}</div>
                      {e.notes && <div className="encounter-notes">{e.notes}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="muted hint">
              {tr('La dificultad sigue las reglas del SRD 5.1 (PX de los monstruos, multiplicador según cuántos son y umbrales del grupo). Al soltar un encuentro, cada monstruo tiene su hoja (Goblin 1, Goblin 2…) y aparece en casillas libres alrededor del centro de tu vista, sin atravesar paredes.')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function PartyLine({ party }: { party: ReturnType<typeof useParty> }) {
  const { detected, manual, save, levels } = party;
  const size = levels.length;
  const level = Math.round(levels.reduce((a, b) => a + b, 0) / Math.max(1, size));
  return (
    <div className="row party-line">
      <span>{tr('Grupo:')}</span>
      <input type="number" className="tiny-number" min={1} max={10} value={size} onChange={(e) => save({ size: Math.max(1, Math.min(10, Number(e.target.value) || 1)), level })} aria-label={tr('Personajes')} />
      <span>{tr('personajes de nivel')}</span>
      <input type="number" className="tiny-number" min={1} max={20} value={level} onChange={(e) => save({ size, level: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} aria-label={tr('Nivel')} />
      {manual ? (
        detected.length > 0 && (
          <button className="ghost small" onClick={() => save(null)} title={tr('Usar los {length} PJ de la partida', { length: detected.length })}>
            {tr('Usar los PJ')}
          </button>
        )
      ) : (
        <small className="muted">{detected.length ? tr('(los {length} PJ de la partida: niveles {1})', { length: detected.length, '1': detected.join(', ') }) : tr('(no hay PJ con jugador: cámbialo a mano)')}</small>
      )}
    </div>
  );
}

function EncounterEditor({ campaignId, initial, levels, onDone }: { campaignId: string; initial: Encounter | null; levels: number[]; onDone: (saved: Encounter | null) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [monsters, setMonsters] = useState<EncounterMonster[]>(initial?.monsters ?? []);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Exclude<Difficulty, 'trivial'>>('medium');
  const rating = rateEncounter(monsters, levels);
  const total = monsters.reduce((n, m) => n + m.count, 0);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    return MONSTERS.filter((m) => norm(`${m.name} ${m.en} ${m.type} ${tr(m.type)}`).includes(q))
      .sort((a, b) => crValue(a.cr) - crValue(b.cr))
      .slice(0, 8);
  }, [query]);

  const add = (monsterId: string) =>
    setMonsters((list) => (list.some((m) => m.monsterId === monsterId) ? list.map((m) => (m.monsterId === monsterId ? { ...m, count: Math.min(40, m.count + 1) } : m)) : [...list, { monsterId, count: 1 }]));
  const setCount = (monsterId: string, count: number) => setMonsters((list) => (count <= 0 ? list.filter((m) => m.monsterId !== monsterId) : list.map((m) => (m.monsterId === monsterId ? { ...m, count: Math.min(40, count) } : m))));

  function suggest() {
    const list = suggestEncounter(levels, target);
    if (!list.length) return setError(tr('No he encontrado una combinación para ese grupo. Prueba otra dificultad.'));
    setError(null);
    setMonsters(list);
    if (!name.trim()) setName(tr('Encuentro {0}', { '0': DIFFICULTY_LABELS[target].toLowerCase() }));
  }

  async function save() {
    if (!name.trim()) return setError(tr('Ponle un nombre.'));
    if (total > 40) return setError(tr('Como mucho 40 monstruos por encuentro.'));
    try {
      const body = { name: name.trim(), notes, monsters };
      const { encounter } = initial
        ? await api.patch<{ encounter: Encounter }>(`/encounters/${initial.id}`, body)
        : await api.post<{ encounter: Encounter }>(`/campaigns/${campaignId}/encounters`, body);
      onDone(encounter);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="encounter-editor">
      <label>
        {tr('Nombre')}
        <input value={name} maxLength={80} placeholder={tr('Emboscada goblin')} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      <div className="row encounter-suggest">
        <span>{tr('🎲 Sugerir uno')}</span>
        <select value={target} onChange={(e) => setTarget(e.target.value as typeof target)} aria-label={tr('Dificultad')}>
          {(['easy', 'medium', 'hard', 'deadly'] as const).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <button className="small" onClick={suggest} title={tr('Elige monstruos del compendio al azar para esa dificultad (puedes pulsar varias veces)')}>
          {tr('Sugerir')}
        </button>
      </div>

      <div className="encounter-picked">
        {monsters.length === 0 && <p className="muted">{tr('Busca monstruos abajo y pulsa + para añadirlos, o pide una sugerencia.')}</p>}
        {monsters.map((m) => {
          const def = monsterById(m.monsterId);
          return (
            <div key={m.monsterId} className="row spread encounter-picked-row">
              <span>
                <strong>{def ? localName(def) : m.monsterId}</strong>{' '}
                <small className="muted">
                  {tr('VD')} {def?.cr} · {def ? xpOfCr(def.cr) : 0} {tr('PX')}
                </small>
              </span>
              <span className="row">
                <button className="ghost small" onClick={() => setCount(m.monsterId, m.count - 1)} aria-label={tr('Uno menos')}>
                  −
                </button>
                <input type="number" className="tiny-number" min={0} max={40} value={m.count} onChange={(e) => setCount(m.monsterId, Math.round(Number(e.target.value)) || 0)} aria-label={tr('Cuántos')} />
                <button className="ghost small" onClick={() => setCount(m.monsterId, m.count + 1)} aria-label={tr('Uno más')}>
                  +
                </button>
              </span>
            </div>
          );
        })}
        {monsters.length > 0 && (
          <p className="encounter-rating">
            {total} {total === 1 ? tr('monstruo') : tr('monstruos')} · {rating.xp}{' '}{tr('PX (×')}{' '}{rating.multiplier} = {rating.adjustedXp}) → <DifficultyBadge difficulty={rating.difficulty} xp={rating.adjustedXp} />{' '}
            <small className="muted">
              {tr('(fácil')}{' '}{rating.thresholds.easy}{tr(', media')}{' '}{rating.thresholds.medium}{tr(', difícil')}{' '}{rating.thresholds.hard}{tr(', mortal')}{' '}{rating.thresholds.deadly})
            </small>
          </p>
        )}
      </div>

      <input placeholder={tr('Buscar monstruo (nombre, inglés o tipo)')} value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <ul className="encounter-results">
          {results.map((m) => (
            <li key={m.id} className="row spread">
              <span>
                {localName(m)} {lang === 'es' && <small className="muted">{m.en}</small>}
              </span>
              <span className="row">
                <small className="muted">
                  {tr('VD')} {m.cr} · {xpOfCr(m.cr)} {tr('PX')}
                </small>
                <button className="small" onClick={() => add(m.id)} title={tr('Añadir uno')}>
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <label>
        {tr('Notas (solo tú)')}
        <textarea rows={2} maxLength={5000} value={notes} placeholder={tr('Dónde están, cómo atacan, qué botín llevan…')} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary" onClick={() => void save()}>
          {tr('Guardar')}
        </button>
        <button className="ghost" onClick={() => onDone(null)}>
          {tr('Cancelar')}
        </button>
      </div>
    </div>
  );
}
