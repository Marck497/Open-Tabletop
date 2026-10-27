import { useEffect, useMemo, useState } from 'react';
import { coinsOf, loadSrd, type SrdItem } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { useHomebrew } from '../homebrew/store';
import { useSheets } from '../sheets/store';
import { tr } from '../../core/i18n';

interface Row {
  key: number;
  name: string;
  qty: number;
  to: string;
}

let seq = 0;

/**
 * 💰 Botín (solo DM): un montón de objetos y monedas que se reparte a las hojas. Los objetos van al
 * inventario de quien elijas (si coincide con una ⚗ Creación, con sus botones); las monedas, que pueden
 * ser una tirada («4d6*10»), se reparten a partes iguales o enteras a cada uno. Todo lo hace el servidor.
 */
export function LootWindow({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const characters = useSheets((s) => s.characters);
  const template = useSheets((s) => s.template);
  const entries = useHomebrew((s) => s.entries);
  const [srd, setSrd] = useState<SrdItem[]>([]);
  // Por defecto, los personajes de los jugadores.
  const pcs = useMemo(() => Object.values(characters).sort((a, b) => a.name.localeCompare(b.name)), [characters]);
  const [chosen, setChosen] = useState<string[]>(() => pcs.filter((c) => c.controlledBy.length).map((c) => c.id));
  const [rows, setRows] = useState<Row[]>([]);
  const [coins, setCoins] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'split' | 'each'>('split');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSrd()
      .then((d) => setSrd(d.items))
      .catch(() => undefined);
  }, []);

  const coinFields = template ? coinsOf(template) : [];
  const items = Object.values(entries).filter((e) => e.kind === 'item');
  const firstTo = chosen[0] ?? pcs[0]?.id ?? '';
  const addRow = (name = '') => setRows((r) => [...r, { key: ++seq, name, qty: 1, to: firstTo }]);
  const patchRow = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function give() {
    setBusy(true);
    setError(null);
    try {
      const norm = (s: string) => s.trim().toLowerCase();
      await emitAck('loot:give', {
        campaignId,
        characterIds: chosen,
        coins: Object.fromEntries(Object.entries(coins).filter(([, v]) => v.trim())),
        coinMode: mode,
        items: rows
          .filter((r) => r.name.trim() && r.to)
          .map((r) => {
            const entry = items.find((e) => norm(e.name) === norm(r.name));
            const fromSrd = srd.find((s) => norm(s.name) === norm(r.name));
            return { name: r.name.trim(), qty: r.qty, to: r.to, entryId: entry?.id ?? null, ...(!entry && fromSrd?.weight !== undefined ? { weight: fromSrd.weight } : {}) };
          }),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal compendium loot" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Botín')}>
        <h2>{tr('💰 Repartir botín')}</h2>

        <fieldset className="owners">
          <legend>{tr('Monedas para')}</legend>
          <div className="row wrap">
            {pcs.map((c) => (
              <label key={c.id} className="switch">
                <input
                  type="checkbox"
                  checked={chosen.includes(c.id)}
                  onChange={(e) => setChosen((list) => (e.target.checked ? [...list, c.id] : list.filter((x) => x !== c.id)))}
                />
                {c.name}
              </label>
            ))}
          </div>
          {coinFields.length ? (
            <>
              <div className="row wrap">
                {coinFields.map((c) => (
                  <label key={c.key} className="coin">
                    {c.label}
                    <input value={coins[c.key] ?? ''} placeholder="0" maxLength={100} onChange={(e) => setCoins((s) => ({ ...s, [c.key]: e.target.value }))} />
                  </label>
                ))}
              </div>
              <div className="row">
                <label className="switch">
                  <input type="radio" name="coin-mode" checked={mode === 'split'} onChange={() => setMode('split')} />{tr('A partes iguales')}
                </label>
                <label className="switch">
                  <input type="radio" name="coin-mode" checked={mode === 'each'} onChange={() => setMode('each')} />
                  {tr('Cada uno, la cantidad entera')}
                </label>
              </div>
              <p className="muted hint">{tr('Puedes poner una tirada, p. ej. «4d6*10»: la tira el servidor y sale en el chat.')}</p>
            </>
          ) : (
            <p className="muted hint">{tr('La plantilla de hoja no tiene campos de monedas.')}</p>
          )}
        </fieldset>

        <fieldset className="owners">
          <legend>{tr('Objetos')}</legend>
          <datalist id="loot-items">
            {items.map((e) => (
              <option key={e.id} value={e.name}>
                {tr('⚗ Creación')}
              </option>
            ))}
            {srd.map((s) => (
              <option key={s.id} value={s.name}>
                {s.cat}
              </option>
            ))}
          </datalist>
          {rows.map((r) => (
            <div key={r.key} className="row loot-row">
              <input type="number" className="tiny-number" min={1} max={9999} value={r.qty} onChange={(e) => patchRow(r.key, { qty: Math.max(1, Math.min(9999, Math.round(+e.target.value) || 1)) })} />
              <input list="loot-items" value={r.name} maxLength={80} placeholder={tr('Objeto (de ⚗ Creaciones, del SRD o lo que quieras)')} onChange={(e) => patchRow(r.key, { name: e.target.value })} />
              <select value={r.to} onChange={(e) => patchRow(r.key, { to: e.target.value })} aria-label={tr('Para')}>
                {pcs.map((c) => (
                  <option key={c.id} value={c.id}>
                    → {c.name}
                  </option>
                ))}
              </select>
              <button className="ghost small" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} aria-label={tr('Quitar')}>
                ✕
              </button>
            </div>
          ))}
          <button className="ghost small" onClick={() => addRow()} disabled={!pcs.length}>
            {tr('+ Objeto')}
          </button>
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="row">
          <button onClick={() => void give()} disabled={busy || (!rows.some((r) => r.name.trim()) && !Object.values(coins).some((v) => v.trim()))}>
            {tr('💰 Repartir')}
          </button>
          <button className="ghost" onClick={onClose}>
            {tr('Cancelar')}
          </button>
        </div>
      </div>
    </div>
  );
}
