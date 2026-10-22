import { useMemo, useState } from 'react';
import { crValue, MONSTERS, monsterAi, SIZE_CELLS, type Character, type Monster } from '@vtt/shared';
import { api } from '../../core/api';
import { useBoard } from '../board/store';
import { addCharacterToken } from '../sheets/tokens';
import { useSheets } from '../sheets/store';

const CR_FILTERS = [
  { id: 'all', label: 'Todos', test: () => true },
  { id: 'low', label: 'VD ≤ 1', test: (cr: number) => cr <= 1 },
  { id: 'mid', label: 'VD 2-4', test: (cr: number) => cr >= 2 && cr <= 4 },
  { id: 'high', label: 'VD 5+', test: (cr: number) => cr >= 5 },
] as const;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Compendio de monstruos del SRD: crea sus hojas y los pone en el tablero con la IA lista. */
export function CompendiumWindow({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof CR_FILTERS)[number]['id']>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasScene = useBoard((s) => !!s.scene);

  const list = useMemo(() => {
    const q = norm(query.trim());
    const test = CR_FILTERS.find((f) => f.id === filter)!.test;
    return MONSTERS.filter((m) => test(crValue(m.cr)) && (!q || norm(`${m.name} ${m.en} ${m.type}`).includes(q))).sort(
      (a, b) => crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name),
    );
  }, [query, filter]);

  async function add(m: Monster, toBoard: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      for (let i = 1; i <= count; i++) {
        const name = count > 1 ? `${m.name} ${i}` : m.name;
        const { character } = await api.post<{ character: Character }>(`/campaigns/${campaignId}/compendium/${m.id}`, { name });
        useSheets.getState().upsert(character);
        if (toBoard) await addCharacterToken(character, { cells: SIZE_CELLS[m.size], ai: monsterAi(m) });
      }
      setMessage(`${count > 1 ? `${count} × ` : ''}${m.name}: ${toBoard ? 'en el tablero con la IA activada' : 'añadido a Personajes'}.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal compendium" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compendio de monstruos">
        <div className="row spread">
          <h2>📖 Compendio de monstruos</h2>
          <button className="ghost small" onClick={onClose} title="Cerrar">
            ✕
          </button>
        </div>
        <div className="row">
          <input placeholder="Buscar (nombre, inglés o tipo)" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          {CR_FILTERS.map((f) => (
            <button key={f.id} className={`small ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="switch">
          Cuántos
          <input type="number" className="tiny-number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Math.round(Number(e.target.value)) || 1)))} />
          <small className="muted">(cada uno con su hoja, para llevar su vida por separado)</small>
        </label>
        {message && <p className="muted">{message}</p>}
        <ul className="compendium-list">
          {list.map((m) => (
            <li key={m.id}>
              <div className="row spread compendium-row">
                <button className="ghost compendium-name" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                  <strong>{m.name}</strong> <small className="muted">{m.en}</small>
                </button>
                <span className="compendium-stats">
                  VD {m.cr} · CA {m.ac} · PG {m.hp}
                </span>
                <span className="row">
                  <button className="ghost small" disabled={busy} onClick={() => void add(m, false)} title="Crea su hoja en Personajes">
                    + Hoja
                  </button>
                  <button className="small primary" disabled={busy || !hasScene} onClick={() => void add(m, true)} title="Crea su hoja y su token en el centro de la vista, con la IA activada">
                    + Al tablero
                  </button>
                </span>
              </div>
              {openId === m.id && <MonsterDetails m={m} />}
            </li>
          ))}
          {list.length === 0 && <p className="muted">Ningún monstruo coincide.</p>}
        </ul>
        <p className="muted hint">Datos del SRD 5.1 de D&D (CC-BY-4.0). Al añadirlos puedes cambiar lo que quieras en su hoja.</p>
      </div>
    </div>
  );
}

const ABILITY_LABELS = ['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR'];
const mod = (v: number) => {
  const m = Math.floor((v - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
};

function MonsterDetails({ m }: { m: Monster }) {
  const ai = monsterAi(m);
  return (
    <div className="monster-details">
      <p className="muted">
        {m.type}, {m.size} · {m.speed} pies{m.speedNote ? `, ${m.speedNote}` : ''} · Dados de golpe {m.hitDice}
      </p>
      <div className="ability-row">
        {m.abilities.map((v, i) => (
          <span key={i}>
            <small>{ABILITY_LABELS[i]}</small> {v} ({mod(v)})
          </span>
        ))}
      </div>
      <ul>
        {m.attacks.map((a) => (
          <li key={a.name}>
            <strong>{a.name}</strong> {a.bonus} al ataque, {a.ranged ? `a distancia ${a.reach * 5} pies` : `alcance ${a.reach * 5} pies`}: {a.damage} {a.type}
          </li>
        ))}
      </ul>
      {m.traits && <p>{m.traits}</p>}
      <p className="muted">
        IA: {ai.behavior === 'ranged' ? 'a distancia' : ai.behavior === 'cautious' ? 'prudente' : ai.behavior === 'guard' ? 'guardián' : 'cuerpo a cuerpo'}, ataca con {m.attacks[ai.attackIndex]?.name}.
      </p>
    </div>
  );
}
