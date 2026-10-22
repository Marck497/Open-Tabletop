import { useState } from 'react';
import {
  BUILTIN_TEMPLATES,
  combatOf,
  DND5E_STATUSES,
  statusesOf,
  type CombatMapping,
  type StatusDef,
  checkSyntax,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  sheetTemplateSchema,
  type FieldType,
  type SheetField,
  type SheetSection,
  type SheetTemplate,
} from '@vtt/shared';
import { api } from '../../core/api';

interface Props {
  campaignId: string;
  template: SheetTemplate;
  onClose: () => void;
}

/**
 * Editor de la plantilla de hoja. Permite cambiar secciones, campos, fórmulas y tiradas,
 * cargar otro sistema de serie o importar/exportar la plantilla en JSON.
 */
export function TemplateEditor({ campaignId, template, onClose }: Props) {
  const [draft, setDraft] = useState<SheetTemplate>(() => structuredClone(template));
  const [sectionIdx, setSectionIdx] = useState(0);
  const [jsonMode, setJsonMode] = useState(false);
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const section = draft.sections[sectionIdx];
  const update = (fn: (t: SheetTemplate) => void) =>
    setDraft((d) => {
      const next = structuredClone(d);
      fn(next);
      return next;
    });

  function validate(t: SheetTemplate): string | null {
    const parsed = sheetTemplateSchema.safeParse(t);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      return `${issue.message} (${issue.path.join(' › ')})`;
    }
    for (const s of t.sections)
      for (const f of [...s.fields, ...s.fields.flatMap((x) => x.columns ?? [])]) {
        for (const [what, expr] of [
          ['fórmula', f.formula],
          ['tirada', f.roll],
        ] as const) {
          const err = expr ? checkSyntax(expr) : null;
          if (err) return `Campo "${f.key}", ${what}: ${err}`;
        }
      }
    return null;
  }

  async function save() {
    let t = draft;
    if (jsonMode) {
      try {
        t = JSON.parse(json);
      } catch {
        return setError('El JSON no es válido');
      }
    }
    const err = validate(t);
    if (err) return setError(err);
    setSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}/sheet-template`, { template: t });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function loadBuiltin(id: string) {
    if (!confirm('Se sustituirá la plantilla actual por la elegida. Los valores ya escritos en las hojas se conservan. ¿Seguir?')) return;
    await api.post(`/campaigns/${campaignId}/sheet-template/reset`, { builtinId: id });
    onClose();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plantilla-${draft.name.toLowerCase().replace(/\W+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJson(file: File) {
    try {
      const t = JSON.parse(await file.text());
      const err = validate(t);
      if (err) return setError(err);
      setDraft(t);
      setSectionIdx(0);
      setError(null);
    } catch {
      setError('El archivo no es un JSON válido');
    }
  }

  const toggleJson = () => {
    if (!jsonMode) setJson(JSON.stringify(draft, null, 2));
    else
      try {
        setDraft(JSON.parse(json));
        setSectionIdx(0);
      } catch {
        return setError('El JSON no es válido');
      }
    setError(null);
    setJsonMode(!jsonMode);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal card template-editor">
        <div className="row spread">
          <h2>Plantilla de hoja</h2>
          <div className="row">
            <select defaultValue="" onChange={(e) => e.target.value && void loadBuiltin(e.target.value)}>
              <option value="">Cargar sistema de serie…</option>
              {Object.entries(BUILTIN_TEMPLATES).map(([id, b]) => (
                <option key={id} value={id}>
                  {b.label}
                </option>
              ))}
            </select>
            <button className="ghost small" onClick={exportJson}>
              Exportar
            </button>
            <label className="button-like ghost small">
              Importar
              <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
            </label>
            <button className="ghost small" onClick={toggleJson}>
              {jsonMode ? 'Editor visual' : 'Editar JSON'}
            </button>
          </div>
        </div>

        {jsonMode ? (
          <textarea className="json-editor" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        ) : (
          <>
            <div className="field-row">
              <label>
                Nombre del sistema
                <input value={draft.name} onChange={(e) => update((t) => void (t.name = e.target.value))} />
              </label>
              <BarsEditor template={draft} update={update} />
              <CombatEditor template={draft} update={update} />
              <StatusesEditor template={draft} update={update} />
            </div>
            <div className="template-layout">
              <nav className="template-sections">
                {draft.sections.map((s, i) => (
                  <button key={i} className={`ghost ${i === sectionIdx ? 'active' : ''}`} onClick={() => setSectionIdx(i)}>
                    {s.title || '(sin título)'}
                  </button>
                ))}
                <button
                  className="ghost small"
                  onClick={() => {
                    update((t) => void t.sections.push({ id: `seccion_${t.sections.length + 1}`, title: 'Nueva sección', columns: 2, fields: [] }));
                    setSectionIdx(draft.sections.length);
                  }}
                >
                  + Sección
                </button>
              </nav>
              {section && (
                <SectionEditor
                  key={sectionIdx}
                  section={section}
                  onChange={(fn) => update((t) => fn(t.sections[sectionIdx]!))}
                  onMove={(dir) => {
                    const j = sectionIdx + dir;
                    if (j < 0 || j >= draft.sections.length) return;
                    update((t) => ([t.sections[sectionIdx], t.sections[j]] = [t.sections[j]!, t.sections[sectionIdx]!]));
                    setSectionIdx(j);
                  }}
                  onDelete={() => {
                    if (!confirm('¿Quitar esta sección?')) return;
                    update((t) => void t.sections.splice(sectionIdx, 1));
                    setSectionIdx(Math.max(0, sectionIdx - 1));
                  }}
                />
              )}
            </div>
          </>
        )}

        <details className="help">
          <summary>Ayuda: fórmulas y tiradas</summary>
          <p>
            Las fórmulas usan las <b>claves</b> de otros campos: <code>floor((fue - 10) / 2)</code>. Funciones: <code>floor ceil round abs min max if(cond, a, b)</code>. Comparaciones: <code>== != &lt; &gt; &lt;= &gt;=</code>.
          </p>
          <p>
            Las tiradas además admiten dados: <code>1d20 + @{'{fue_mod}'}</code>, ventaja <code>2d20kh1</code>, desventaja <code>2d20kl1</code>. Si un campo de texto contiene una tirada (p. ej. daño <code>1d8+3</code>), <code>@{'{dano}'}</code> la tira.
          </p>
          <p>Cambiar una clave hace que los personajes pierdan el valor guardado con la clave antigua.</p>
        </details>

        {error && <p className="error">{error}</p>}
        <div className="row spread">
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={saving} onClick={() => void save()}>
            Guardar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}

function BarsEditor({ template, update }: { template: SheetTemplate; update: (fn: (t: SheetTemplate) => void) => void }) {
  const bar = template.bars[0];
  const numericKeys = template.sections.flatMap((s) => s.fields).filter((f) => f.type === 'number' || f.type === 'computed');
  return (
    <label>
      Barra sobre los tokens (valor / máximo)
      <span className="row">
        <select
          value={bar?.value ?? ''}
          onChange={(e) => update((t) => void (t.bars = e.target.value ? [{ value: e.target.value, max: bar?.max, color: bar?.color ?? '#c0392b' }] : []))}
        >
          <option value="">Sin barra</option>
          {numericKeys.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </select>
        {bar && (
          <select value={bar.max ?? ''} onChange={(e) => update((t) => void (t.bars[0]!.max = e.target.value || undefined))}>
            <option value="">Sin máximo</option>
            {numericKeys.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label} ({f.key})
              </option>
            ))}
          </select>
        )}
      </span>
    </label>
  );
}

/** Qué campos usa la IA de enemigos (CA, vida, velocidad y la tabla de ataques). */
function CombatEditor({ template, update }: { template: SheetTemplate; update: (fn: (t: SheetTemplate) => void) => void }) {
  const combat: CombatMapping = template.combat ?? combatOf(template) ?? { ac: '', hp: '', hpMax: '', hpTemp: '', speed: '', attacks: null };
  const fields = template.sections.flatMap((s) => s.fields);
  const numeric = fields.filter((f) => f.type === 'number' || f.type === 'computed');
  const lists = fields.filter((f) => f.type === 'list');
  const set = (patch: Partial<CombatMapping>) => update((t) => void (t.combat = { ...combat, ...patch }));
  const pick = (key: 'ac' | 'hp' | 'hpMax' | 'hpTemp' | 'speed', label: string, options = numeric) => (
    <label>
      {label}
      <select value={combat[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">—</option>
        {options.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label} ({f.key})
          </option>
        ))}
      </select>
    </label>
  );
  const list = lists.find((l) => l.key === combat.attacks?.list);
  const cols = list?.columns ?? [];
  const col = (key: 'name' | 'attack' | 'damage' | 'extra' | 'crit', label: string, optional = false) => (
    <label>
      {label}
      <select value={combat.attacks?.[key] ?? ''} onChange={(e) => set({ attacks: { ...combat.attacks!, [key]: e.target.value || undefined } })}>
        {optional && <option value="">—</option>}
        {cols.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label} ({c.key})
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <details className="help">
      <summary>Combate, barras de vida, botones de acción e IA de enemigos</summary>
      <p className="muted hint">Qué campos usan los enemigos con IA para atacar y para saber a quién le queda poca vida, y los botones de atacar, lanzar, usar y descansar de las hojas.</p>
      <div className="field-row">
        {pick('ac', 'Defensa (CA)')}
        {pick('speed', 'Velocidad')}
      </div>
      <div className="field-row">
        {pick('hp', 'Vida actual (se le resta el daño)', fields.filter((f) => f.type === 'number'))}
        {pick('hpMax', 'Vida máxima')}
      </div>
      <div className="field-row">{pick('hpTemp', 'Puntos de golpe temporales', fields.filter((f) => f.type === 'number'))}</div>
      <label>
        Tabla de ataques
        <select
          value={combat.attacks?.list ?? ''}
          onChange={(e) => {
            const l = lists.find((x) => x.key === e.target.value);
            const first = l?.columns?.[0]?.key ?? '';
            set({ attacks: l ? { list: l.key, name: first, attack: first, damage: first } : null });
          }}
        >
          <option value="">Ninguna</option>
          {lists.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </select>
      </label>
      {combat.attacks && list && (
        <>
          <div className="field-row three">
            {col('name', 'Nombre')}
            {col('attack', 'Tirada de ataque')}
            {col('damage', 'Daño')}
          </div>
          <div className="field-row">
            {col('extra', 'Daño extra (opcional)', true)}
            {col('crit', 'Crítico con (opcional)', true)}
          </div>
        </>
      )}
      <TableMapping
        label="Tabla de conjuros (✨ Lanzar)"
        lists={lists}
        value={combat.spells ?? null}
        columns={[
          ['name', 'Nombre'],
          ['level', 'Nivel (0 = truco)'],
          ['effect', 'Tirada de efecto'],
        ]}
        onChange={(spells) => set({ spells: spells as CombatMapping['spells'] })}
      />
      <div className="field-row three">
        <label>
          Espacios máx. ({'{n}'} = nivel)
          <input value={combat.slots?.max ?? ''} placeholder="espacios_{n}_max" onChange={(e) => set({ slots: e.target.value ? { max: e.target.value, used: combat.slots?.used ?? '', pact: combat.slots?.pact ?? '' } : null })} />
        </label>
        <label>
          Espacios gastados
          <input value={combat.slots?.used ?? ''} placeholder="espacios_{n}_usados" disabled={!combat.slots} onChange={(e) => set({ slots: { ...combat.slots!, used: e.target.value } })} />
        </label>
        <label>
          Casilla de pacto
          <select value={combat.slots?.pact ?? ''} disabled={!combat.slots} onChange={(e) => set({ slots: { ...combat.slots!, pact: e.target.value } })}>
            <option value="">—</option>
            {fields
              .filter((f) => f.type === 'checkbox')
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.key})
                </option>
              ))}
          </select>
        </label>
      </div>
      <TableMapping
        label="Tabla de recursos con usos (▶ Usar y descansos)"
        lists={lists}
        value={combat.resources ?? null}
        columns={[
          ['name', 'Nombre'],
          ['uses', 'Usos que quedan'],
          ['max', 'Máximo'],
          ['recharge', 'Recarga ("corto" o "largo")'],
        ]}
        onChange={(resources) => set({ resources: resources as CombatMapping['resources'] })}
      />
      <TableMapping
        label="Inventario (los objetos consumibles de ⚗ Creaciones restan de la cantidad)"
        lists={lists}
        value={combat.inventory ?? null}
        columns={[
          ['name', 'Nombre'],
          ['qty', 'Cantidad'],
        ]}
        onChange={(inventory) => set({ inventory: inventory as CombatMapping['inventory'] })}
      />
      <p className="muted hint">Para ⚗ Creaciones: con qué se tiran las salvaciones de las áreas y qué usan de serie los hechizos nuevos (vacío = lo de la 5e si la hoja tiene esos campos).</p>
      <div className="field-row">
        <label>
          Salvaciones ({'{a}'} = característica)
          <input value={combat.saves ?? ''} placeholder="sv_{a}" onChange={(e) => set({ saves: e.target.value || undefined })} />
        </label>
        <label>
          Modificador de lanzamiento
          <input value={combat.spellMod ?? ''} placeholder="conj_mod" onChange={(e) => set({ spellMod: e.target.value || undefined })} />
        </label>
      </div>
      <div className="field-row">
        <label>
          Bono de ataque de conjuro
          <input value={combat.spellAttack ?? ''} placeholder="conj_ataque" onChange={(e) => set({ spellAttack: e.target.value || undefined })} />
        </label>
        <label>
          CD de conjuro
          <input value={combat.spellDc ?? ''} placeholder="conj_cd" onChange={(e) => set({ spellDc: e.target.value || undefined })} />
        </label>
      </div>
    </details>
  );
}

/** Elegir una tabla de la hoja y qué columna es cada cosa. */
function TableMapping({
  label,
  lists,
  value,
  columns,
  onChange,
}: {
  label: string;
  lists: SheetField[];
  value: Record<string, string> | null;
  columns: [string, string][];
  onChange: (v: Record<string, string> | null) => void;
}) {
  const list = lists.find((l) => l.key === value?.list);
  return (
    <>
      <label>
        {label}
        <select
          value={value?.list ?? ''}
          onChange={(e) => {
            const l = lists.find((x) => x.key === e.target.value);
            const first = l?.columns?.[0]?.key ?? '';
            onChange(l ? { list: l.key, ...Object.fromEntries(columns.map(([k]) => [k, l.columns?.find((c) => c.key === value?.[k])?.key ?? first])) } : null);
          }}
        >
          <option value="">Ninguna</option>
          {lists.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </select>
      </label>
      {value && list && (
        <div className={`field-row ${columns.length === 3 ? 'three' : ''}`}>
          {columns.map(([k, l]) => (
            <label key={k}>
              {l}
              <select value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })}>
                {(list.columns ?? []).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} ({c.key})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

/** Estados que se pueden marcar en los tokens (condiciones de 5e por defecto). */
function StatusesEditor({ template, update }: { template: SheetTemplate; update: (fn: (t: SheetTemplate) => void) => void }) {
  const list = statusesOf(template);
  const set = (fn: (l: StatusDef[]) => StatusDef[]) => update((t) => void (t.statuses = fn(statusesOf(t).map((d) => ({ ...d })))));
  const patch = (i: number, p: Partial<StatusDef>) => set((l) => l.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const slug = (label: string) =>
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'estado';
  function add() {
    const label = prompt('Nombre del estado');
    if (!label?.trim()) return;
    let id = slug(label);
    while (list.some((d) => d.id === id)) id += '_2';
    set((l) => [...l, { id, label: label.trim(), icon: '❗', incapacitated: false }]);
  }
  return (
    <details className="help">
      <summary>Estados de los tokens ({list.length})</summary>
      <ul className="status-defs">
        {list.map((d, i) => (
          <li key={d.id} className="row">
            <input className="status-icon" value={d.icon} maxLength={8} aria-label="Icono" onChange={(e) => patch(i, { icon: e.target.value || '❗' })} />
            <input value={d.label} maxLength={40} aria-label="Nombre" onChange={(e) => patch(i, { label: e.target.value })} />
            <label className="switch" title="La IA se salta el turno de quien lo tenga">
              <input type="checkbox" checked={d.incapacitated} onChange={(e) => patch(i, { incapacitated: e.target.checked })} />
              Pierde el turno
            </label>
            <button className="ghost small danger" title="Quitar" onClick={() => set((l) => l.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="ghost small" onClick={add}>
          + Estado
        </button>
        <button className="ghost small" onClick={() => set(() => DND5E_STATUSES.map((d) => ({ ...d })))}>
          Restaurar los de 5e
        </button>
      </div>
    </details>
  );
}

interface SectionProps {
  section: SheetSection;
  onChange: (fn: (s: SheetSection) => void) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}

function SectionEditor({ section, onChange, onMove, onDelete }: SectionProps) {
  return (
    <div className="template-section">
      <div className="field-row three">
        <label>
          Título
          <input value={section.title} onChange={(e) => onChange((s) => void (s.title = e.target.value))} />
        </label>
        <label>
          Columnas
          <input type="number" min={1} max={6} value={section.columns} onChange={(e) => onChange((s) => void (s.columns = Number(e.target.value) || 1))} />
        </label>
        <div className="row end">
          <button className="ghost small" onClick={() => onMove(-1)} title="Subir sección">
            ↑
          </button>
          <button className="ghost small" onClick={() => onMove(1)} title="Bajar sección">
            ↓
          </button>
          <button className="ghost small danger" onClick={onDelete}>
            Quitar sección
          </button>
        </div>
      </div>
      <FieldsEditor fields={section.fields} onChange={(fn) => onChange((s) => fn(s.fields))} allowList />
    </div>
  );
}

function FieldsEditor({ fields, onChange, allowList }: { fields: SheetField[]; onChange: (fn: (f: SheetField[]) => void) => void; allowList: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const addField = () => {
    onChange((f) => void f.push({ key: `campo_${Date.now().toString(36).slice(-4)}`, label: 'Nuevo campo', type: 'text' }));
    setOpen(fields.length);
  };

  return (
    <div className="fields-editor">
      {fields.map((f, i) => (
        <div key={i} className={`field-editor ${open === i ? 'open' : ''}`}>
          <div className="field-summary" onClick={() => setOpen(open === i ? null : i)}>
            <span>{f.label || '(sin etiqueta)'}</span>
            <code>{f.key}</code>
            <span className="muted">{FIELD_TYPE_LABELS[f.type]}</span>
            {f.roll && <span title={f.roll}>🎲</span>}
            <span className="row end" onClick={(e) => e.stopPropagation()}>
              <button className="ghost small" onClick={() => i > 0 && onChange((x) => void ([x[i - 1], x[i]] = [x[i]!, x[i - 1]!]))}>
                ↑
              </button>
              <button className="ghost small" onClick={() => i < fields.length - 1 && onChange((x) => void ([x[i + 1], x[i]] = [x[i]!, x[i + 1]!]))}>
                ↓
              </button>
              <button className="ghost small danger" onClick={() => onChange((x) => void x.splice(i, 1))}>
                ✕
              </button>
            </span>
          </div>
          {open === i && <FieldForm field={f} onChange={(fn) => onChange((x) => fn(x[i]!))} allowList={allowList} />}
        </div>
      ))}
      <button className="ghost small" onClick={addField}>
        + Campo
      </button>
    </div>
  );
}

function FieldForm({ field, onChange, allowList }: { field: SheetField; onChange: (fn: (f: SheetField) => void) => void; allowList: boolean }) {
  const set = <K extends keyof SheetField>(k: K, v: SheetField[K]) => onChange((f) => void (f[k] = v));
  const opt = (v: string) => (v === '' ? undefined : v);
  const types = FIELD_TYPES.filter((t) => allowList || t !== 'list');
  const formulaErr = field.formula ? checkSyntax(field.formula) : null;
  const rollErr = field.roll ? checkSyntax(field.roll) : null;

  return (
    <div className="field-form">
      <div className="field-row three">
        <label>
          Etiqueta
          <input value={field.label} onChange={(e) => set('label', e.target.value)} />
        </label>
        <label>
          Clave (para fórmulas)
          <input value={field.key} onChange={(e) => set('key', e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'))} />
        </label>
        <label>
          Tipo
          <select value={field.type} onChange={(e) => set('type', e.target.value as FieldType)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {field.type === 'computed' && (
        <label>
          Fórmula
          <input value={field.formula ?? ''} placeholder="floor((fue - 10) / 2)" onChange={(e) => set('formula', opt(e.target.value))} />
          {formulaErr && <small className="error">{formulaErr}</small>}
        </label>
      )}
      {field.type !== 'list' && (
        <div className="field-row">
          <label>
            Tirada (opcional)
            <input value={field.roll ?? ''} placeholder="1d20 + @{fue_mod}" onChange={(e) => set('roll', opt(e.target.value))} />
            {rollErr && <small className="error">{rollErr}</small>}
          </label>
          <label>
            Nombre de la tirada
            <input value={field.rollLabel ?? ''} placeholder={field.label} onChange={(e) => set('rollLabel', opt(e.target.value))} />
          </label>
        </div>
      )}
      {field.roll && field.type !== 'list' && (
        <label className="switch">
          <input type="checkbox" checked={field.initiative ?? false} onChange={(e) => set('initiative', e.target.checked || undefined)} />
          Esta tirada es la iniciativa (añade al personaje al orden de turnos)
        </label>
      )}
      <div className="field-row three">
        {!['computed', 'list'].includes(field.type) && (
          <label>
            Valor inicial
            <input
              value={field.default === undefined ? '' : String(field.default)}
              onChange={(e) => {
                const v = e.target.value;
                set('default', v === '' ? undefined : field.type === 'number' ? Number(v) || 0 : field.type === 'checkbox' ? v === 'true' : v);
              }}
            />
          </label>
        )}
        <label>
          Ancho (columnas)
          <input type="number" min={1} max={6} value={field.span ?? 1} onChange={(e) => set('span', Number(e.target.value) > 1 ? Number(e.target.value) : undefined)} />
        </label>
        <label>
          Ayuda (tooltip)
          <input value={field.hint ?? ''} onChange={(e) => set('hint', opt(e.target.value))} />
        </label>
      </div>
      {field.type === 'select' && (
        <label>
          Opciones (una por línea, «valor: Etiqueta»)
          <textarea
            rows={4}
            defaultValue={(field.options ?? []).map((o) => `${o.value}: ${o.label}`).join('\n')}
            onBlur={(e) =>
              set(
                'options',
                e.target.value
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => {
                    const [value, ...rest] = l.split(':');
                    return { value: value!.trim(), label: (rest.join(':') || value!).trim() };
                  }),
              )
            }
          />
        </label>
      )}
      {field.type === 'list' && (
        <div className="list-columns">
          <span className="sheet-label">Columnas de la tabla</span>
          <FieldsEditor
            fields={field.columns ?? []}
            allowList={false}
            onChange={(fn) =>
              onChange((f) => {
                f.columns ??= [];
                fn(f.columns);
              })
            }
          />
        </div>
      )}
    </div>
  );
}
