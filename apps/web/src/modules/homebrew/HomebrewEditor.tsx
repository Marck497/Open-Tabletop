import { useMemo, useState } from 'react';
import {
  allFields,
  AREA_SHAPE_LABELS,
  AREA_SHAPES,
  ATTACK_KIND_LABELS,
  ATTACK_KINDS,
  DAMAGE_TYPE_SUGGESTIONS,
  HOMEBREW_KIND_ICONS,
  HOMEBREW_KIND_LABELS,
  HOMEBREW_KINDS,
  homebrewDataSchema,
  homebrewSummary,
  RECHARGE_OPTIONS,
  saveOptions,
  statusesOf,
  type AreaShape,
  type AttackKind,
  type HomebrewData,
  type HomebrewEntry,
  type HomebrewKind,
  type SheetTemplate,
} from '@vtt/shared';
import { api } from '../../core/api';
import { useHomebrew } from './store';

export interface HomebrewDraft {
  id?: string;
  kind: HomebrewKind;
  name: string;
  shared: boolean;
  data: HomebrewData;
}

const SCHOOLS = ['Abjuración', 'Adivinación', 'Conjuración', 'Encantamiento', 'Evocación', 'Ilusión', 'Nigromancia', 'Transmutación'];
const CATEGORIES = ['arma', 'armadura', 'poción', 'pergamino', 'anillo', 'varita', 'bastón', 'cetro', 'objeto maravilloso', 'equipo', 'herramienta', 'munición'];
const RARITIES = ['común', 'poco común', 'raro', 'muy raro', 'legendario', 'artefacto'];

interface Props {
  campaignId: string;
  template: SheetTemplate | null;
  isGm: boolean;
  draft: HomebrewDraft;
  onClose: () => void;
  onSaved: (e: HomebrewEntry) => void;
}

/**
 * Editor visual de una creación: todo lo que hace (ataque, salvación, daños, curación, área,
 * estados, usos) además de su ficha (nivel, escuela, rareza…). Al guardar queda enlazada a las
 * hojas que la tengan, así que los botones de acción usan lo nuevo al momento.
 */
export function HomebrewEditor({ campaignId, template, isGm, draft: initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<HomebrewDraft>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = draft.data;
  const set = (patch: Partial<HomebrewData>) => setDraft((x) => ({ ...x, data: { ...x.data, ...patch } }));

  const saves = useMemo(() => (template ? saveOptions(template) : []), [template]);
  const statuses = useMemo(() => statusesOf(template), [template]);
  // Sugerencias de fórmulas: campos numéricos y calculados de la hoja.
  const refs = useMemo(() => (template ? allFields(template).filter((f) => f.type === 'computed' || f.type === 'number') : []), [template]);
  const check = homebrewDataSchema.safeParse(d);
  const problem = !draft.name.trim() ? 'Ponle un nombre' : check.success ? null : check.error.issues[0]!.message;
  const summary = homebrewSummary(draft, { saveLabel: saves.find((s) => s.value === d.save)?.label, statusLabel: (id) => statuses.find((s) => s.id === id)?.label ?? id });

  async function save() {
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      const body = { kind: draft.kind, name: draft.name.trim(), shared: draft.shared, data: d };
      const { entry } = draft.id
        ? await api.patch<{ entry: HomebrewEntry }>(`/homebrew/${draft.id}`, body)
        : await api.post<{ entry: HomebrewEntry }>(`/campaigns/${campaignId}/homebrew`, body);
      useHomebrew.getState().upsert(entry);
      onSaved(entry);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const toggleCondition = (id: string) => set({ conditions: d.conditions.includes(id) ? d.conditions.filter((c) => c !== id) : [...d.conditions, id] });
  const formula = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <input value={value} placeholder={placeholder} list="hb-refs" onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div className="hb-editor">
      <datalist id="hb-refs">
        {refs.map((f) => (
          <option key={f.key} value={`@{${f.key}}`}>
            {f.label}
          </option>
        ))}
      </datalist>
      <datalist id="hb-damage-types">
        {DAMAGE_TYPE_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="row">
        {HOMEBREW_KINDS.map((k) => (
          <button key={k} className={`small ${draft.kind === k ? 'active' : ''}`} onClick={() => setDraft((x) => ({ ...x, kind: k }))}>
            {HOMEBREW_KIND_ICONS[k]} {HOMEBREW_KIND_LABELS[k]}
          </button>
        ))}
        {isGm && (
          <label className="switch">
            <input type="checkbox" checked={draft.shared} onChange={(e) => setDraft((x) => ({ ...x, shared: e.target.checked }))} />
            Compartida con la mesa
          </label>
        )}
      </div>
      <label>
        Nombre
        <input value={draft.name} maxLength={80} autoFocus onChange={(e) => setDraft((x) => ({ ...x, name: e.target.value }))} />
      </label>

      {draft.kind === 'spell' && (
        <fieldset className="hb-group">
          <legend>Hechizo</legend>
          <div className="field-row three">
            <label>
              Nivel
              <select value={d.level} onChange={(e) => set({ level: Number(e.target.value) })}>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? 'Truco' : `Nivel ${i}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Escuela
              <input value={d.school} list="hb-schools" onChange={(e) => set({ school: e.target.value })} />
              <datalist id="hb-schools">
                {SCHOOLS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              Tiempo de lanzamiento
              <input value={d.castTime} placeholder="1 acción" onChange={(e) => set({ castTime: e.target.value })} />
            </label>
          </div>
          <div className="field-row three">
            <label>
              Alcance
              <input value={d.range} placeholder="60 pies" onChange={(e) => set({ range: e.target.value })} />
            </label>
            <label>
              Componentes
              <input value={d.components} placeholder="V, S, M (…)" onChange={(e) => set({ components: e.target.value })} />
            </label>
            <label>
              Duración
              <input value={d.duration} placeholder="Instantánea" onChange={(e) => set({ duration: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label className="switch">
              <input
                type="checkbox"
                checked={d.concentration}
                onChange={(e) => {
                  const on = e.target.checked;
                  // Al marcar concentración, el lanzador queda marcado con ese estado (si la plantilla lo tiene).
                  const conc = statuses.find((s) => s.id === 'concentracion')?.id ?? '';
                  set({ concentration: on, selfStatus: on && !d.selfStatus ? conc : !on && d.selfStatus === conc ? '' : d.selfStatus });
                }}
              />
              Concentración
            </label>
            <label className="switch">
              <input type="checkbox" checked={d.ritual} onChange={(e) => set({ ritual: e.target.checked })} />
              Ritual
            </label>
          </div>
        </fieldset>
      )}

      {draft.kind === 'item' && (
        <fieldset className="hb-group">
          <legend>Objeto</legend>
          <div className="field-row">
            <label>
              Categoría
              <input value={d.category} list="hb-categories" onChange={(e) => set({ category: e.target.value })} />
              <datalist id="hb-categories">
                {CATEGORIES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              Rareza
              <input value={d.rarity} list="hb-rarities" onChange={(e) => set({ rarity: e.target.value })} />
              <datalist id="hb-rarities">
                {RARITIES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="field-row three">
            <label>
              Peso (lb)
              <input type="number" min={0} step={0.1} value={d.weight} onChange={(e) => set({ weight: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label>
              Precio
              <input value={d.cost} placeholder="50 po" onChange={(e) => set({ cost: e.target.value })} />
            </label>
            <label>
              Alcance
              <input value={d.range} placeholder="Toque, 80/320 pies…" onChange={(e) => set({ range: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label className="switch">
              <input type="checkbox" checked={d.attunement} onChange={(e) => set({ attunement: e.target.checked })} />
              Requiere sintonización
            </label>
            <label className="switch" title="Al usarlo resta uno de la cantidad del inventario">
              <input type="checkbox" checked={d.consumable} onChange={(e) => set({ consumable: e.target.checked })} />
              Consumible (poción, pergamino…)
            </label>
          </div>
        </fieldset>
      )}

      {draft.kind === 'attack' && (
        <label>
          Alcance
          <input value={d.range} placeholder="5 pies, 30/120 pies…" onChange={(e) => set({ range: e.target.value })} />
        </label>
      )}

      <fieldset className="hb-group">
        <legend>Tirada de ataque</legend>
        <div className="field-row three">
          <label>
            Tipo
            <select value={d.attack} onChange={(e) => set({ attack: e.target.value as AttackKind })}>
              {ATTACK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ATTACK_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {d.attack !== 'none' && (
            <>
              <label>
                Bono de ataque
                {formula(d.attackBonus, (v) => set({ attackBonus: v }), '@{competencia} + @{fue_mod}')}
              </label>
              <label>
                Crítico con
                <input type="number" min={2} max={20} value={d.critFrom} onChange={(e) => set({ critFrom: Math.min(20, Math.max(2, Number(e.target.value) || 20)) })} />
              </label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="hb-group">
        <legend>Tirada de salvación</legend>
        <div className="field-row three">
          <label>
            Característica
            <select value={d.save} onChange={(e) => set({ save: e.target.value })}>
              <option value="">Sin salvación</option>
              {saves.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              {d.save && !saves.some((s) => s.value === d.save) && <option value={d.save}>{d.save}</option>}
            </select>
          </label>
          {d.save && (
            <>
              <label>
                CD
                {formula(d.saveDc, (v) => set({ saveDc: v }), '@{conj_cd} o 13')}
              </label>
              <label className="switch hb-inline">
                <input type="checkbox" checked={d.saveHalf} onChange={(e) => set({ saveHalf: e.target.checked })} />
                Mitad de daño si salva
              </label>
            </>
          )}
        </div>
        {d.save && !saves.length && <p className="muted hint">La plantilla de hoja no tiene salvaciones configuradas: se tirará 1d20 a secas.</p>}
      </fieldset>

      <fieldset className="hb-group">
        <legend>Daño y curación</legend>
        {d.damage.map((p, i) => (
          <div key={i} className="row hb-damage">
            <input value={p.dice} placeholder="2d6 + @{fue_mod}" list="hb-refs" onChange={(e) => set({ damage: d.damage.map((x, j) => (j === i ? { ...x, dice: e.target.value } : x)) })} />
            <input value={p.type} placeholder="tipo (fuego…)" list="hb-damage-types" onChange={(e) => set({ damage: d.damage.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} />
            <button className="ghost small danger" title="Quitar" onClick={() => set({ damage: d.damage.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        {d.damage.length < 6 && (
          <button className="ghost small" onClick={() => set({ damage: [...d.damage, { dice: '', type: '' }] })}>
            + Daño{d.damage.length ? ' de otro tipo' : ''}
          </button>
        )}
        <div className="field-row">
          <label>
            Curación
            {formula(d.heal, (v) => set({ heal: v }), '2d4 + 2')}
          </label>
          {draft.kind === 'spell' && d.level > 0 && (
            <label>
              Por cada nivel de espacio superior, suma
              {formula(d.upcast, (v) => set({ upcast: v }), '1d6')}
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="hb-group">
        <legend>Área</legend>
        <div className="field-row">
          <label>
            Forma
            <select value={d.area.shape} onChange={(e) => set({ area: { ...d.area, shape: e.target.value as AreaShape } })}>
              {AREA_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {AREA_SHAPE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {d.area.shape !== 'none' && (
            <label>
              Tamaño (pies)
              <input type="number" min={5} step={5} value={d.area.size || ''} onChange={(e) => set({ area: { ...d.area, size: Math.max(0, Number(e.target.value) || 0) } })} />
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="hb-group">
        <legend>Estados</legend>
        <p className="muted hint">Se ponen a quien alcanza (o a quien falla la salvación) al aplicarlo desde el chat.</p>
        <div className="hb-chips">
          {statuses.map((s) => (
            <button key={s.id} className={`small ${d.conditions.includes(s.id) ? 'active' : ''}`} onClick={() => toggleCondition(s.id)} disabled={!d.conditions.includes(s.id) && d.conditions.length >= 10}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <label>
          Al usarlo, marcar a quien lo usa con
          <select value={d.selfStatus} onChange={(e) => set({ selfStatus: e.target.value })}>
            <option value="">Nada</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="hb-group">
        <legend>Usos</legend>
        <div className="field-row">
          <label>
            Usos (0 = sin límite)
            <input type="number" min={0} max={99} value={d.uses} onChange={(e) => set({ uses: Math.min(99, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
          </label>
          {d.uses > 0 && (
            <label>
              Se recargan con
              <select value={d.recharge} onChange={(e) => set({ recharge: e.target.value as HomebrewData['recharge'] })}>
                {RECHARGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </fieldset>

      <label>
        Descripción
        <textarea rows={5} value={d.description} maxLength={10000} onChange={(e) => set({ description: e.target.value })} />
      </label>

      <p className="muted hint">
        En las fórmulas vale un número o cualquier campo de la hoja de quien lo use, como <code>@{'{fue_mod}'}</code> o <code>@{'{competencia}'}</code> (las sugerencias salen al escribir).
      </p>
      {summary && <p className="hb-summary">{summary}</p>}
      {(problem || error) && <p className="error">{error ?? problem}</p>}
      <div className="row">
        <button onClick={() => void save()} disabled={!!problem || saving}>
          {saving ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Crear'}
        </button>
        <button className="ghost" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
