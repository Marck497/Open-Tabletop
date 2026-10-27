import { useState } from 'react';
import type { Character, Macro } from '@vtt/shared';
import { api } from '../../core/api';
import { useSheets } from '../sheets/store';
import { runMacro } from './run';
import { useMacros } from './useMacros';
import { tr } from '../../core/i18n';

interface Props {
  campaignId: string;
  isGm: boolean;
  meId: string;
}

/** Barra de macros sobre el tablero, con su gestor. */
export function MacroBar({ campaignId, isGm, meId }: Props) {
  const macros = useMacros(campaignId);
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const bar = macros.filter((m) => m.inBar);

  async function run(m: Macro) {
    setBusy(m.id);
    try {
      await runMacro(campaignId, m, meId, isGm);
    } catch (e) {
      alert(`${m.name}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="macro-bar card" role="toolbar" aria-label={tr('Macros')} data-tour="macros">
        {bar.map((m) => (
          <button key={m.id} className="small" disabled={busy === m.id} title={m.command} onClick={() => void run(m)}>
            {m.shared ? '★ ' : ''}
            {m.name}
          </button>
        ))}
        <button className="ghost small" title={tr('Gestionar macros')} onClick={() => setManaging(true)}>
          {bar.length ? '⚙' : tr('⚙ Macros')}
        </button>
      </div>
      {managing && <MacroManager campaignId={campaignId} isGm={isGm} meId={meId} macros={macros} onRun={run} onClose={() => setManaging(false)} />}
    </>
  );
}

interface ManagerProps extends Props {
  macros: Macro[];
  onRun: (m: Macro) => void;
  onClose: () => void;
}

function MacroManager({ campaignId, isGm, meId, macros, onRun, onClose }: ManagerProps) {
  const [editing, setEditing] = useState<Macro | 'new' | null>(macros.length ? null : 'new');
  const characters = useSheets((s) => s.characters);
  const mine = Object.values(characters).filter((c) => isGm || c.controlledBy.includes(meId));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Macros')}>
        <div className="row spread">
          <h2>{tr('Macros')}</h2>
          <button className="ghost small" onClick={onClose} title={tr('Cerrar')}>
            ✕
          </button>
        </div>
        {editing ? (
          <MacroForm
            key={editing === 'new' ? 'new' : editing.id}
            campaignId={campaignId}
            isGm={isGm}
            macro={editing === 'new' ? null : editing}
            characters={mine}
            onDone={() => setEditing(null)}
          />
        ) : (
          <>
            <ul className="macro-list">
              {macros.map((m) => {
                const editable = m.ownerId === meId || isGm;
                return (
                  <li key={m.id} className="row">
                    <button className="small" onClick={() => onRun(m)} title={tr('Lanzar')}>
                      ▶
                    </button>
                    <span className="macro-name">
                      {m.name}
                      {m.shared && <small className="muted">{' '}{tr('· de la mesa')}</small>}
                      {m.characterId && characters[m.characterId] && <small className="muted"> · {characters[m.characterId]!.name}</small>}
                    </span>
                    <code className="macro-cmd">{m.command.split('\n')[0]}</code>
                    {editable && (
                      <button className="ghost small" onClick={() => setEditing(m)}>
                        ✎
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <button className="small primary" onClick={() => setEditing('new')}>
              {tr('+ Nueva macro')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MacroForm(props: { campaignId: string; isGm: boolean; macro: Macro | null; characters: Character[]; onDone: () => void }) {
  const { campaignId, isGm, macro, characters, onDone } = props;
  const [form, setForm] = useState({
    name: macro?.name ?? '',
    command: macro?.command ?? '/r 1d20 + @{fue_mod} ' + tr('Ataque'),
    characterId: macro?.characterId ?? '',
    shared: macro?.shared ?? false,
    inBar: macro?.inBar ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const body = { ...form, characterId: form.characterId || null };
    try {
      if (macro) await api.patch(`/macros/${macro.id}`, body);
      else await api.post(`/campaigns/${campaignId}/macros`, body);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="macro-form">
      <label>
        {tr('Nombre')}
        <input value={form.name} maxLength={40} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        {tr('Líneas')}{' '}<small className="muted">{tr('(una por mensaje: /r, /gr, /w, /em o texto; @{campo} usa la hoja del personaje)')}</small>
        <textarea rows={4} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
      </label>
      <label>
        {tr('Tirar como')}
        <select value={form.characterId} onChange={(e) => setForm({ ...form, characterId: e.target.value })}>
          <option value="">{tr('El personaje del token seleccionado (o yo)')}</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="switch">
        <input type="checkbox" checked={form.inBar} onChange={(e) => setForm({ ...form, inBar: e.target.checked })} />
        {tr('Mostrar en la barra')}
      </label>
      {isGm && (
        <label className="switch">
          <input type="checkbox" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />
          {tr('Para toda la mesa (los jugadores también la ven)')}
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row spread">
        {macro ? (
          <button className="ghost small danger" onClick={() => confirm(tr('¿Borrar "{name}"?', { name: macro.name })) && void api.delete(`/macros/${macro.id}`).then(onDone)}>
            {tr('Borrar')}
          </button>
        ) : (
          <span />
        )}
        <span className="row">
          <button className="ghost" onClick={onDone}>
            {tr('Cancelar')}
          </button>
          <button className="primary" disabled={!form.name.trim()} onClick={() => void save()}>
            {tr('Guardar')}
          </button>
        </span>
      </div>
    </div>
  );
}
