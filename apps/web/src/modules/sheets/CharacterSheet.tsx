import { useMemo, useState } from 'react';
import {
  assetUrl,
  computeAll,
  createResolver,
  evaluate,
  type CampaignMember,
  type Character,
  type SheetField,
  type SheetRow,
  type SheetTemplate,
  type SheetValue,
  type UpdateCharacterInput,
} from '@vtt/shared';
import { api } from '../../core/api';
import { roll } from '../dice/roll';
import { AssetPicker } from '../board/AssetPicker';
import { addCharacterToken } from './tokens';
import { newRowId, SheetFieldView } from './SheetField';
import { useSheets } from './store';

interface Props {
  character: Character;
  template: SheetTemplate;
  isGm: boolean;
  meId: string;
  members: CampaignMember[];
  index: number;
}

/** Ventana con la hoja de un personaje, generada a partir de la plantilla. */
export function CharacterSheet({ character, template, isGm, meId, members, index }: Props) {
  const { closeSheet, patchValues } = useSheets.getState();
  const canEdit = isGm || character.controlledBy.includes(meId);
  const computed = useMemo(() => computeAll(template, character.values), [template, character.values]);
  const [settings, setSettings] = useState(false);
  const [picker, setPicker] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const save = (patch: UpdateCharacterInput) => api.patch(`/characters/${character.id}`, patch).catch((e: Error) => alert(e.message));
  const setValue = (key: string, value: SheetValue) => {
    patchValues(character.id, { [key]: value });
    void save({ values: { [key]: value } });
  };

  const doRoll = (field: SheetField, row?: { listKey: string; row: SheetRow }) => {
    if (!field.roll) return;
    const label = field.rollLabel ?? field.label;
    const rowName = row ? String(row.row.nombre ?? row.row.objeto ?? '') : '';
    void roll({
      campaignId: character.campaignId,
      characterId: character.id,
      expression: field.roll,
      label: rowName ? `${label}: ${rowName}` : label,
      row: row ? { listKey: row.listKey, rowId: row.row._id } : null,
    });
  };

  return (
    <div className="sheet-window card" style={{ right: 12 + index * 24, top: 12 + index * 24 }}>
      <header className="sheet-header">
        <button className="avatar" disabled={!canEdit} onClick={() => setPicker(true)} title={canEdit ? 'Cambiar imagen' : undefined}>
          {character.avatarAssetId ? <img src={assetUrl(character.avatarAssetId)} alt="" /> : <span>{character.name.slice(0, 1)}</span>}
        </button>
        <input
          className="sheet-name"
          defaultValue={character.name}
          key={character.name}
          readOnly={!canEdit}
          onBlur={(e) => e.target.value.trim() && e.target.value !== character.name && void save({ name: e.target.value.trim() })}
        />
        {isGm && (
          <button className="ghost small" onClick={() => setSettings((v) => !v)} title="Permisos y opciones">
            ⚙
          </button>
        )}
        <button className="ghost small" onClick={() => closeSheet(character.id)} title="Cerrar">
          ✕
        </button>
      </header>

      {isGm && settings && <GmSettings character={character} members={members} onSave={save} />}
      {!canEdit && <p className="muted hint">Solo lectura.</p>}

      <div className="sheet-body">
        {template.sections.map((section) => (
          <section key={section.id} className="sheet-section">
            <h4 onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}>
              {collapsed[section.id] ? '▸' : '▾'} {section.title}
            </h4>
            {!collapsed[section.id] && (
              <div className="sheet-grid" style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }}>
                {section.fields.map((f) =>
                  f.type === 'list' ? (
                    <ListField
                      key={f.key}
                      field={f}
                      rows={(character.values[f.key] as SheetRow[] | undefined) ?? []}
                      readOnly={!canEdit}
                      template={template}
                      values={character.values}
                      onChange={(rows) => setValue(f.key, rows)}
                      onRoll={(col, row) => doRoll(col, { listKey: f.key, row })}
                    />
                  ) : (
                    <SheetFieldView
                      key={f.key}
                      field={f}
                      value={character.values[f.key]}
                      computed={computed[f.key]}
                      readOnly={!canEdit}
                      onChange={(v) => setValue(f.key, v)}
                      onRoll={canEdit ? () => doRoll(f) : undefined}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      {picker && (
        <AssetPicker
          campaignId={character.campaignId}
          onClose={() => setPicker(false)}
          onPick={(a) => {
            setPicker(false);
            void save({ avatarAssetId: a.id });
          }}
        />
      )}
    </div>
  );
}

function GmSettings({ character, members, onSave }: { character: Character; members: CampaignMember[]; onSave: (p: UpdateCharacterInput) => void }) {
  const players = members.filter((m) => m.role === 'player');
  const toggle = (id: string) =>
    onSave({ controlledBy: character.controlledBy.includes(id) ? character.controlledBy.filter((x) => x !== id) : [...character.controlledBy, id] });

  async function remove() {
    if (!confirm(`¿Borrar a "${character.name}"? Sus tokens quedarán sin vincular.`)) return;
    await api.delete(`/characters/${character.id}`);
  }

  return (
    <div className="sheet-settings">
      <fieldset className="owners">
        <legend>Lo controlan (pueden editar la hoja y mover sus tokens)</legend>
        {players.length === 0 && <span className="muted">Aún no hay jugadores en la partida.</span>}
        {players.map((p) => (
          <label key={p.id} className="switch">
            <input type="checkbox" checked={character.controlledBy.includes(p.id)} onChange={() => toggle(p.id)} />
            {p.displayName}
          </label>
        ))}
      </fieldset>
      <label className="switch">
        <input type="checkbox" checked={character.visibleToAll} onChange={(e) => onSave({ visibleToAll: e.target.checked })} />
        Todos los jugadores pueden ver la hoja
      </label>
      <div className="row">
        <button className="small" onClick={() => void addCharacterToken(character)}>
          Poner token en el tablero
        </button>
        <button className="ghost small danger" onClick={() => void remove()}>
          Borrar personaje
        </button>
      </div>
    </div>
  );
}

interface ListProps {
  field: SheetField;
  rows: SheetRow[];
  readOnly: boolean;
  template: SheetTemplate;
  values: Character['values'];
  onChange: (rows: SheetRow[]) => void;
  onRoll: (col: SheetField, row: SheetRow) => void;
}

/** Tabla de filas repetibles (ataques, conjuros, inventario...). */
function ListField({ field, rows, readOnly, template, values, onChange, onRoll }: ListProps) {
  const cols = field.columns ?? [];
  const addRow = () => {
    const row: SheetRow = { _id: newRowId() };
    for (const c of cols) if (c.type !== 'computed') row[c.key] = c.default ?? (c.type === 'number' ? 0 : c.type === 'checkbox' ? false : '');
    onChange([...rows, row]);
  };
  const setCell = (id: string, key: string, v: SheetValue) => onChange(rows.map((r) => (r._id === id ? { ...r, [key]: v as string } : r)));
  const computeCell = (col: SheetField, row: SheetRow) => {
    if (col.type !== 'computed' || !col.formula) return undefined;
    try {
      return evaluate(col.formula, { resolve: createResolver(template, values, row) }).value;
    } catch {
      return 0;
    }
  };

  return (
    <div className="sheet-list" style={{ gridColumn: '1 / -1' }}>
      <div className="sheet-label">{field.label}</div>
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            {!readOnly && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id}>
              {cols.map((c) => (
                <td key={c.key}>
                  <SheetFieldView
                    compact
                    field={c}
                    value={row[c.key]}
                    computed={computeCell(c, row)}
                    readOnly={readOnly}
                    onChange={(v) => setCell(row._id, c.key, v)}
                    onRoll={readOnly ? undefined : () => onRoll(c, row)}
                  />
                </td>
              ))}
              {!readOnly && (
                <td>
                  <button className="ghost small danger" title="Quitar fila" onClick={() => onChange(rows.filter((r) => r._id !== row._id))}>
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button className="ghost small" onClick={addRow}>
          + Añadir fila
        </button>
      )}
    </div>
  );
}
