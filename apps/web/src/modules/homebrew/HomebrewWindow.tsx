import { useMemo, useState } from 'react';
import {
  blankHomebrew,
  HOMEBREW_KIND_ICONS,
  HOMEBREW_KIND_LABELS,
  HOMEBREW_KINDS,
  homebrewSummary,
  saveOptions,
  slotsOf,
  statusesOf,
  type CampaignMember,
  type HomebrewEntry,
  type HomebrewKind,
} from '@vtt/shared';
import { api } from '../../core/api';
import { useSheets } from '../sheets/store';
import { norm } from '../srd/useSrd';
import { addToSheet, runEntry } from './actions';
import { HomebrewEditor, type HomebrewDraft } from './HomebrewEditor';
import { useHomebrew } from './store';
import { tr } from '../../core/i18n';

interface Props {
  campaignId: string;
  isGm: boolean;
  meId: string;
  members: CampaignMember[];
  /** Abrir directamente el editor con esto (p. ej. una copia de un conjuro del SRD). */
  initialDraft?: HomebrewDraft | null;
  onClose: () => void;
}

/**
 * Creaciones de la mesa: lista de hechizos, ataques y objetos propios, con el editor, "añadir a
 * la hoja" (filas enlazadas que usan los botones de acción) y "usar" con un personaje.
 */
export function HomebrewWindow({ campaignId, isGm, meId, members, initialDraft, onClose }: Props) {
  const entries = useHomebrew((s) => s.entries);
  const template = useSheets((s) => s.template);
  const characters = useSheets((s) => s.characters);
  const [kind, setKind] = useState<HomebrewKind | ''>('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<HomebrewDraft | null>(initialDraft ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const editable = Object.values(characters)
    .filter((c) => isGm || c.controlledBy.includes(meId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const target = characters[targetId] ?? editable[0];
  const saves = useMemo(() => (template ? saveOptions(template) : []), [template]);
  const statuses = useMemo(() => statusesOf(template), [template]);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '¿?';

  const list = useMemo(() => {
    const q = norm(query.trim());
    return Object.values(entries)
      .filter((e) => (!kind || e.kind === kind) && (!q || norm(`${e.name} ${e.data.school} ${e.data.category} ${e.data.damage.map((d) => d.type).join(' ')}`).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, kind, query]);

  const canEdit = (e: HomebrewEntry) => isGm || e.ownerId === meId;
  const summary = (e: HomebrewEntry) =>
    homebrewSummary(e, { saveLabel: saves.find((s) => s.value === e.data.save)?.label, statusLabel: (id) => statuses.find((s) => s.id === id)?.label ?? id });

  async function add(e: HomebrewEntry) {
    if (!target || !template) return;
    try {
      const lists = await addToSheet(target, template, e);
      setMessage(tr('{name} añadido a la hoja de {name2} ({2}). Sus botones ⚔ / ✨ / ▶ ya usan esta creación.', { name: e.name, name2: target.name, '2': lists.join(', ') }));
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function use(e: HomebrewEntry) {
    if (!target) return;
    let slot: number | undefined;
    if (e.kind === 'spell' && e.data.level > 0 && template) {
      const free = slotsOf(template, target.values).filter((s) => s.level >= e.data.level && s.used < s.max);
      if (free.length > 1) {
        const answer = prompt(tr('¿Con qué espacio? ({0})', { '0': free.map((s) => tr('{level}: quedan {1}', { level: s.level, '1': s.max - s.used })).join(' · ') }), String(free[0]!.level));
        if (answer === null) return;
        slot = Number(answer) || undefined;
      }
    }
    try {
      await runEntry(target.id, e.id, slot);
      setMessage(tr('{name} usa {name2}: mira el chat.', { name: target.name, name2: e.name }));
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function remove(e: HomebrewEntry) {
    if (!confirm(tr('¿Borrar "{name}"? Las hojas que la tengan conservan sus filas, pero dejarán de usar esta creación.', { name: e.name }))) return;
    await api.delete(`/homebrew/${e.id}`).catch((err: Error) => setMessage(err.message));
  }

  const startNew = (k: HomebrewKind) => setEditing({ kind: k, name: '', shared: isGm, data: blankHomebrew(k, template) });
  const duplicate = (e: HomebrewEntry) => setEditing({ kind: e.kind, name: tr('{name} (copia)', { name: e.name }), shared: false, data: structuredClone(e.data) });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal compendium" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Creaciones')}>
        <div className="row spread">
          <h2>{tr('⚗ Creaciones')}</h2>
          <button className="ghost small" onClick={onClose} title={tr('Cerrar')}>
            ✕
          </button>
        </div>
        {editing ? (
          <HomebrewEditor
            campaignId={campaignId}
            template={template}
            isGm={isGm}
            draft={editing}
            onClose={() => setEditing(null)}
            onSaved={(e) => {
              setEditing(null);
              setOpen(e.id);
              setMessage(tr('Guardado: {name}.', { name: e.name }));
            }}
          />
        ) : (
          <>
            <p className="muted hint">{tr('Hechizos, ataques y objetos hechos a medida. Añádelos a una hoja y sus botones de acción harán exactamente lo que diga aquí; el DM aplica salvaciones, daño y estados desde el chat.')}</p>
            <div className="row">
              {HOMEBREW_KINDS.map((k) => (
                <button key={k} className="small" onClick={() => startNew(k)}>
                  + {HOMEBREW_KIND_ICONS[k]} {HOMEBREW_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <div className="row">
              <input placeholder={tr('Buscar')} value={query} onChange={(e) => setQuery(e.target.value)} />
              <select value={kind} onChange={(e) => setKind(e.target.value as HomebrewKind | '')}>
                <option value="">{tr('Todo')}</option>
                {HOMEBREW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {HOMEBREW_KIND_LABELS[k]}s
                  </option>
                ))}
              </select>
              {editable.length > 0 && (
                <label className="switch">
                  {tr('Personaje')}
                  <select value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)}>
                    {editable.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {message && <p className="muted">{message}</p>}
            {list.length === 0 && (
              <p className="muted">{Object.keys(entries).length ? tr('Nada coincide con la búsqueda.') : tr('Aún no hay creaciones. Crea una o copia un conjuro u objeto desde 📚 Reglas (botón ✎).')}</p>
            )}
            <ul className="compendium-list">
              {list.map((e) => (
                <li key={e.id}>
                  <div className="row spread compendium-row">
                    <button className="ghost compendium-name" onClick={() => setOpen(open === e.id ? null : e.id)} title={summary(e)}>
                      {HOMEBREW_KIND_ICONS[e.kind]} <strong>{e.name}</strong>{' '}
                      {e.shared ? <span className="badge">{tr('Compartida')}</span> : e.ownerId !== meId && <span className="badge gm">{tr('de {name}', { name: nameOf(e.ownerId) })}</span>}
                    </button>
                    {target && (
                      <>
                        <button className="ghost small" onClick={() => void add(e)} title={tr('Añadir a la hoja de {name}', { name: target.name })}>
                          {tr('+ Hoja')}
                        </button>
                        <button className="ghost small" onClick={() => void use(e)} title={tr('Usar ahora con {name}', { name: target.name })}>
                          ▶
                        </button>
                      </>
                    )}
                    {canEdit(e) && (
                      <button className="ghost small" onClick={() => setEditing({ id: e.id, kind: e.kind, name: e.name, shared: e.shared, data: structuredClone(e.data) })} title={tr('Editar')}>
                        ✎
                      </button>
                    )}
                    <button className="ghost small" onClick={() => duplicate(e)} title={tr('Duplicar')}>
                      ⧉
                    </button>
                    {canEdit(e) && (
                      <button className="ghost small danger" onClick={() => void remove(e)} title={tr('Borrar')}>
                        🗑
                      </button>
                    )}
                  </div>
                  {open === e.id && <Details entry={e} summary={summary(e)} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Details({ entry, summary }: { entry: HomebrewEntry; summary: string }) {
  const d = entry.data;
  const facts = [d.castTime, d.range, d.components, d.duration, d.cost, d.weight ? `${d.weight} lb` : '', d.attunement ? tr('requiere sintonización') : ''].filter(Boolean).join(' · ');
  return (
    <div className="monster-details">
      <p className="hb-summary">{summary || HOMEBREW_KIND_LABELS[entry.kind]}</p>
      {facts && <p className="muted">{facts}</p>}
      {d.description && <p className="srd-desc">{d.description}</p>}
    </div>
  );
}
