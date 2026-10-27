import { useEffect, useState } from 'react';
import type { SheetField as Field, SheetRow, SheetValue } from '@vtt/shared';
import { tr } from '../../core/i18n';

interface Props {
  field: Field;
  value: SheetValue | undefined;
  computed?: number;
  readOnly: boolean;
  onChange: (value: SheetValue) => void;
  onRoll?: () => void;
  /** Dentro de una tabla: sin etiqueta. */
  compact?: boolean;
}

/** Un campo de la hoja. Los textos y números se guardan al salir del campo (o con Enter). */
export function SheetFieldView({ field, value, computed, readOnly, onChange, onRoll, compact }: Props) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  const commit = () => {
    if (readOnly) return;
    const next = field.type === 'number' ? Number(draft) || 0 : String(draft);
    if (next !== value) onChange(next);
  };

  const rollBtn = onRoll && field.roll && (
    <button type="button" className="roll-btn" onClick={onRoll} title={tr('Tirar: {roll}', { roll: field.roll })}>
      🎲
    </button>
  );

  let control: React.ReactNode;
  switch (field.type) {
    case 'computed':
      control = <output className="computed">{formatSigned(field, computed ?? 0)}</output>;
      break;
    case 'checkbox':
      control = <input type="checkbox" checked={Boolean(value)} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} />;
      break;
    case 'textarea':
      control = (
        <textarea rows={4} value={String(draft)} readOnly={readOnly} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      );
      break;
    case 'select':
      control = (
        <select value={String(value ?? '')} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {tr(o.label)}
            </option>
          ))}
        </select>
      );
      break;
    default:
      control = (
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={String(draft)}
          readOnly={readOnly}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      );
  }

  if (compact)
    return (
      <div className={`sheet-cell type-${field.type}`}>
        {control}
        {rollBtn}
      </div>
    );

  return (
    <label className={`sheet-field type-${field.type}`} style={field.span ? { gridColumn: `span ${field.span}` } : undefined} title={field.hint && tr(field.hint)}>
      <span className="sheet-label">{tr(field.label)}</span>
      <span className="sheet-control">
        {control}
        {rollBtn}
      </span>
    </label>
  );
}

/** Los modificadores se muestran con signo (+3, -1). */
function formatSigned(field: Field, n: number) {
  const signed = /mod|bono|^sv_|competencia|iniciativa|ataque/.test(field.key) || (field.roll?.includes(`@{${field.key}}`) ?? false);
  return signed && n >= 0 ? `+${n}` : String(n);
}

export function newRowId() {
  return Math.random().toString(36).slice(2, 10);
}

export type { SheetRow };
