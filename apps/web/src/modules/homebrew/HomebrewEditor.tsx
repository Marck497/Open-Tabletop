import { useMemo, useState } from 'react';
import {
  allFields,
  AREA_SHAPE_LABELS,
  AREA_SHAPES,
  ATTACK_KIND_LABELS,
  ATTACK_KINDS,
  autoFxStyle,
  DAMAGE_TYPE_SUGGESTIONS,
  fxForHomebrew,
  FX_STYLE_LABELS,
  FX_STYLES,
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
  type FxStyle,
  type HomebrewData,
  type HomebrewEntry,
  type HomebrewKind,
  type SheetTemplate,
} from '@vtt/shared';
import { api } from '../../core/api';
import { useHomebrew } from './store';
import { tr } from '../../core/i18n';

export interface HomebrewDraft {
  id?: string;
  kind: HomebrewKind;
  name: string;
  shared: boolean;
  data: HomebrewData;
}

const SCHOOLS = [tr('Abjuración'), tr('Adivinación'), tr('Conjuración'), tr('Encantamiento'), tr('Evocación'), tr('Ilusión'), tr('Nigromancia'), tr('Transmutación')];
const CATEGORIES = ['arma', 'armadura', 'poción', 'pergamino', 'anillo', 'varita', 'bastón', 'cetro', 'objeto maravilloso', 'equipo', 'herramienta', 'munición'].map((c) => tr(c));
const RARITIES = ['común', 'poco común', 'raro', 'muy raro', 'legendario', 'artefacto'].map((r) => tr(r));

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
  // Las creaciones de antes de las animaciones no traen `fx`.
  const fx = (d.fx as HomebrewData['fx'] | undefined) ?? { style: 'auto', color: '' };
  const autoStyle = autoFxStyle(draft.kind, d);
  const cue = fxForHomebrew({ kind: draft.kind, data: { ...d, fx: { ...fx, style: fx.style === 'none' ? 'auto' : fx.style } } });
  const statuses = useMemo(() => statusesOf(template), [template]);
  // Sugerencias de fórmulas: campos numéricos y calculados de la hoja.
  const refs = useMemo(() => (template ? allFields(template).filter((f) => f.type === 'computed' || f.type === 'number') : []), [template]);
  const check = homebrewDataSchema.safeParse(d);
  const problem = !draft.name.trim() ? tr('Ponle un nombre') : check.success ? null : check.error.issues[0]!.message;
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
          <option key={t} value={tr(t)} />
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
            {tr('Compartida con la mesa')}
          </label>
        )}
      </div>
      <label>
        {tr('Nombre')}
        <input value={draft.name} maxLength={80} autoFocus onChange={(e) => setDraft((x) => ({ ...x, name: e.target.value }))} />
      </label>

      {draft.kind === 'spell' && (
        <fieldset className="hb-group">
          <legend>{tr('Hechizo')}</legend>
          <div className="field-row three">
            <label>
              {tr('Nivel')}
              <select value={d.level} onChange={(e) => set({ level: Number(e.target.value) })}>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? tr('Truco') : tr('Nivel {i}', { i })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr('Escuela')}
              <input value={d.school} list="hb-schools" onChange={(e) => set({ school: e.target.value })} />
              <datalist id="hb-schools">
                {SCHOOLS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              {tr('Tiempo de lanzamiento')}
              <input value={d.castTime} placeholder={tr('1 acción')} onChange={(e) => set({ castTime: e.target.value })} />
            </label>
          </div>
          <div className="field-row three">
            <label>
              {tr('Alcance')}
              <input value={d.range} placeholder={tr('60 pies')} onChange={(e) => set({ range: e.target.value })} />
            </label>
            <label>
              {tr('Componentes')}
              <input value={d.components} placeholder={tr('V, S, M (…)')} onChange={(e) => set({ components: e.target.value })} />
            </label>
            <label>
              {tr('Duración')}
              <input value={d.duration} placeholder={tr('Instantánea')} onChange={(e) => set({ duration: e.target.value })} />
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
              {tr('Concentración')}
            </label>
            <label className="switch">
              <input type="checkbox" checked={d.ritual} onChange={(e) => set({ ritual: e.target.checked })} />
              {tr('Ritual')}
            </label>
          </div>
        </fieldset>
      )}

      {draft.kind === 'item' && (
        <fieldset className="hb-group">
          <legend>{tr('Objeto')}</legend>
          <div className="field-row">
            <label>
              {tr('Categoría')}
              <input value={d.category} list="hb-categories" onChange={(e) => set({ category: e.target.value })} />
              <datalist id="hb-categories">
                {CATEGORIES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label>
              {tr('Rareza')}
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
              {tr('Peso (lb)')}
              <input type="number" min={0} step={0.1} value={d.weight} onChange={(e) => set({ weight: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label>
              {tr('Precio')}
              <input value={d.cost} placeholder={tr('50 po')} onChange={(e) => set({ cost: e.target.value })} />
            </label>
            <label>
              {tr('Alcance')}
              <input value={d.range} placeholder={tr('Toque, 80/320 pies…')} onChange={(e) => set({ range: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label className="switch">
              <input type="checkbox" checked={d.attunement} onChange={(e) => set({ attunement: e.target.checked })} />
              {tr('Requiere sintonización')}
            </label>
            <label className="switch" title={tr('Al usarlo resta uno de la cantidad del inventario')}>
              <input type="checkbox" checked={d.consumable} onChange={(e) => set({ consumable: e.target.checked })} />
              {tr('Consumible (poción, pergamino…)')}
            </label>
          </div>
        </fieldset>
      )}

      {draft.kind === 'attack' && (
        <label>
          {tr('Alcance')}
          <input value={d.range} placeholder={tr('5 pies, 30/120 pies…')} onChange={(e) => set({ range: e.target.value })} />
        </label>
      )}

      <fieldset className="hb-group">
        <legend>{tr('Tirada de ataque')}</legend>
        <div className="field-row three">
          <label>
            {tr('Tipo')}
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
                {tr('Bono de ataque')}
                {formula(d.attackBonus, (v) => set({ attackBonus: v }), '@{competencia} + @{fue_mod}')}
              </label>
              <label>
                {tr('Crítico con')}
                <input type="number" min={2} max={20} value={d.critFrom} onChange={(e) => set({ critFrom: Math.min(20, Math.max(2, Number(e.target.value) || 20)) })} />
              </label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="hb-group">
        <legend>{tr('Tirada de salvación')}</legend>
        <div className="field-row three">
          <label>
            {tr('Característica')}
            <select value={d.save} onChange={(e) => set({ save: e.target.value })}>
              <option value="">{tr('Sin salvación')}</option>
              {saves.map((s) => (
                <option key={s.value} value={s.value}>
                  {tr(s.label)}
                </option>
              ))}
              {d.save && !saves.some((s) => s.value === d.save) && <option value={d.save}>{d.save}</option>}
            </select>
          </label>
          {d.save && (
            <>
              <label>
                {tr('CD')}
                {formula(d.saveDc, (v) => set({ saveDc: v }), tr('@{conj_cd} o 13'))}
              </label>
              <label className="switch hb-inline">
                <input type="checkbox" checked={d.saveHalf} onChange={(e) => set({ saveHalf: e.target.checked })} />
                {tr('Mitad de daño si salva')}
              </label>
            </>
          )}
        </div>
        {d.save && !saves.length && <p className="muted hint">{tr('La plantilla de hoja no tiene salvaciones configuradas: se tirará 1d20 a secas.')}</p>}
      </fieldset>

      <fieldset className="hb-group">
        <legend>{tr('Daño y curación')}</legend>
        {d.damage.map((p, i) => (
          <div key={i} className="row hb-damage">
            <input value={p.dice} placeholder="2d6 + @{fue_mod}" list="hb-refs" onChange={(e) => set({ damage: d.damage.map((x, j) => (j === i ? { ...x, dice: e.target.value } : x)) })} />
            <input value={p.type} placeholder={tr('tipo (fuego…)')} list="hb-damage-types" onChange={(e) => set({ damage: d.damage.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} />
            <button className="ghost small danger" title={tr('Quitar')} onClick={() => set({ damage: d.damage.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        {d.damage.length < 6 && (
          <button className="ghost small" onClick={() => set({ damage: [...d.damage, { dice: '', type: '' }] })}>
            {tr('+ Daño')}{d.damage.length ? tr(' de otro tipo') : ''}
          </button>
        )}
        <div className="field-row">
          <label>
            {tr('Curación')}
            {formula(d.heal, (v) => set({ heal: v }), '2d4 + 2')}
          </label>
          {draft.kind === 'spell' && d.level > 0 && (
            <label>
              {tr('Por cada nivel de espacio superior, suma')}
              {formula(d.upcast, (v) => set({ upcast: v }), '1d6')}
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="hb-group">
        <legend>{tr('Área')}</legend>
        <div className="field-row">
          <label>
            {tr('Forma')}
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
              {tr('Tamaño (pies)')}
              <input type="number" min={5} step={5} value={d.area.size || ''} onChange={(e) => set({ area: { ...d.area, size: Math.max(0, Number(e.target.value) || 0) } })} />
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="hb-group">
        <legend>{tr('Animación en el tablero')}</legend>
        <div className="field-row">
          <label>
            {tr('Estilo')}
            <select value={fx.style} onChange={(e) => set({ fx: { ...fx, style: e.target.value as FxStyle } })}>
              {FX_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s === 'auto' ? tr('Automática ({0})', { '0': autoStyle ? FX_STYLE_LABELS[autoStyle].replace(/^\S+ /, '').toLowerCase() : tr('ninguna') }) : FX_STYLE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {fx.style !== 'none' && (
            <label>
              {tr('Color')}
              <span className="row">
                <input type="color" value={cue?.color ?? '#ffffff'} onChange={(e) => set({ fx: { ...fx, color: e.target.value } })} />
                {fx.color ? (
                  <button className="ghost small" onClick={() => set({ fx: { ...fx, color: '' } })} title={tr('Usar el color del tipo de daño')}>
                    {tr('Automático')}
                  </button>
                ) : (
                  <span className="muted">{tr('según el tipo de daño')}</span>
                )}
              </span>
            </label>
          )}
        </div>
        <p className="muted hint">{tr('Se ve sobre el tablero al usarlo, desde el token de quien lo usa hacia los objetivos marcados (Alt+clic en un token) o la plantilla de área.')}</p>
      </fieldset>

      <fieldset className="hb-group">
        <legend>{tr('Estados')}</legend>
        <p className="muted hint">{tr('Se ponen a quien alcanza (o a quien falla la salvación) al aplicarlo desde el chat.')}</p>
        <div className="hb-chips">
          {statuses.map((s) => (
            <button key={s.id} className={`small ${d.conditions.includes(s.id) ? 'active' : ''}`} onClick={() => toggleCondition(s.id)} disabled={!d.conditions.includes(s.id) && d.conditions.length >= 10}>
              {s.icon} {tr(s.label)}
            </button>
          ))}
        </div>
        <label>
          {tr('Al usarlo, marcar a quien lo usa con')}
          <select value={d.selfStatus} onChange={(e) => set({ selfStatus: e.target.value })}>
            <option value="">{tr('Nada')}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {tr(s.label)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="hb-group">
        <legend>{tr('Usos')}</legend>
        <div className="field-row">
          <label>
            {tr('Usos (0 = sin límite)')}
            <input type="number" min={0} max={99} value={d.uses} onChange={(e) => set({ uses: Math.min(99, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
          </label>
          {d.uses > 0 && (
            <label>
              {tr('Se recargan con')}
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
        {tr('Descripción')}
        <textarea rows={5} value={d.description} maxLength={10000} onChange={(e) => set({ description: e.target.value })} />
      </label>

      <p className="muted hint">
        {tr('En las fórmulas vale un número o cualquier campo de la hoja de quien lo use, como')}{' '}<code>@{'{fue_mod}'}</code> o <code>@{'{competencia}'}</code>{' '}{tr('(las sugerencias salen al escribir).')}
      </p>
      {summary && <p className="hb-summary">{summary}</p>}
      {(problem || error) && <p className="error">{error ?? problem}</p>}
      <div className="row">
        <button onClick={() => void save()} disabled={!!problem || saving}>
          {saving ? tr('Guardando…') : draft.id ? tr('Guardar cambios') : tr('Crear')}
        </button>
        <button className="ghost" onClick={onClose}>
          {tr('Cancelar')}
        </button>
      </div>
    </div>
  );
}
