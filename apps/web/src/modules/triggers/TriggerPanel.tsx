import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DAMAGE_TYPE_SUGGESTIONS,
  saveOptions,
  TRIGGER_COLORS,
  TRIGGER_ICONS,
  TRIGGER_KINDS,
  TRIGGER_LABELS,
  TRIGGER_WHO,
  TRIGGER_WHO_LABELS,
  type BoardItem,
  type Trigger,
  type TriggerKind,
} from '@vtt/shared';
import { updateSelected } from '../board/actions';
import { deleteItem } from '../board/history';
import { useBoard } from '../board/store';
import { useSheets } from '../sheets/store';
import { tr } from '../../core/i18n';

/** Panel de una trampa o zona de aviso seleccionada (solo el DM). */
export function TriggerPanel({ item, notes }: { item: BoardItem; notes: ReactNode }) {
  const t = item.trigger!;
  const scene = useBoard((s) => s.scene)!;
  const template = useSheets((s) => s.template);
  const saves = useMemo(() => (template ? saveOptions(template) : []), [template]);
  const [form, setForm] = useState({ name: item.name, message: t.message, damage: t.damage, damageType: t.damageType, dc: String(t.dc) });
  // Cada campo se pone al día solo cuando cambia el suyo (si no, la respuesta a otro cambio borraría lo que se está escribiendo).
  useEffect(() => setForm((f) => ({ ...f, name: item.name })), [item.id, item.name]);
  useEffect(() => setForm((f) => ({ ...f, message: t.message })), [item.id, t.message]);
  useEffect(() => setForm((f) => ({ ...f, damage: t.damage })), [item.id, t.damage]);
  useEffect(() => setForm((f) => ({ ...f, damageType: t.damageType })), [item.id, t.damageType]);
  useEffect(() => setForm((f) => ({ ...f, dc: String(t.dc) })), [item.id, t.dc]);
  // Lo último que se ha mandado: si se cambian varios campos seguidos, cada cambio lleva también los anteriores
  // (aunque el servidor aún no haya contestado al primero).
  const latest = useRef(t);
  useEffect(() => {
    latest.current = t;
  }, [t]);
  const save = (patch: Partial<Trigger>, extra: object = {}) => {
    latest.current = { ...latest.current, ...patch };
    return updateSelected({ trigger: latest.current, ...extra })?.catch((e: Error) => {
      const cur = useBoard.getState().items[item.id]?.trigger ?? t;
      latest.current = cur;
      // Vuelve a lo guardado (p. ej. una fórmula de daño mal escrita).
      setForm((f) => ({ ...f, message: cur.message, damage: cur.damage, damageType: cur.damageType, dc: String(cur.dc) }));
      useBoard.getState().showNotice(e.message);
    });
  };
  const setKind = (kind: TriggerKind) => save({ kind }, { drawing: { ...item.drawing!, text: TRIGGER_ICONS[kind], stroke: TRIGGER_COLORS[kind] } });
  const trap = t.kind === 'trap';

  return (
    <div className="panel">
      <h3>
        {TRIGGER_ICONS[t.kind]} {TRIGGER_LABELS[t.kind]}
        {!t.active && <span className="muted">{' '}{tr('· ya saltó')}</span>}
      </h3>
      <div className="field-row">
        <label>
          {tr('Nombre')}
          <input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => form.name !== item.name && updateSelected({ name: form.name })} />
        </label>
        <label>
          {tr('Tipo')}
          <select value={t.kind} onChange={(e) => void setKind(e.target.value as TriggerKind)}>
            {TRIGGER_KINDS.map((k) => (
              <option key={k} value={k}>
                {TRIGGER_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" checked={t.active} onChange={(e) => void save({ active: e.target.checked })} />
        {tr('Armada (salta cuando un token entra)')}
      </label>
      <label className="switch">
        <input type="checkbox" checked={t.once} onChange={(e) => void save({ once: e.target.checked })} />
        {tr('Solo una vez (luego se desarma)')}
      </label>
      <label>
        {tr('La dispara')}
        <select value={t.who} onChange={(e) => void save({ who: e.target.value as Trigger['who'] })}>
          {TRIGGER_WHO.map((w) => (
            <option key={w} value={w}>
              {TRIGGER_WHO_LABELS[w]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr('Mensaje para todos en el chat')}
        <textarea
          rows={2}
          maxLength={1000}
          value={form.message}
          placeholder={trap ? tr('¡El suelo cede bajo tus pies!') : tr('Se oye un crujido entre los árboles…')}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          onBlur={() => form.message !== t.message && save({ message: form.message })}
        />
      </label>

      {trap && (
        <fieldset className="owners">
          <legend>{tr('Salvación y daño (se tiran y se aplican solos al token)')}</legend>
          <div className="field-row">
            <label>
              {tr('Salvación')}
              <select value={t.save} onChange={(e) => void save({ save: e.target.value })}>
                <option value="">{tr('Ninguna')}</option>
                {saves.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {t.save && (
              <label style={{ maxWidth: 70 }}>
                {tr('CD')}
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={form.dc}
                  onChange={(e) => setForm({ ...form, dc: e.target.value })}
                  onBlur={() => +form.dc >= 1 && +form.dc <= 40 && +form.dc !== t.dc && save({ dc: Math.round(+form.dc) })}
                />
              </label>
            )}
          </div>
          <div className="field-row">
            <label>
              {tr('Daño')}
              <input value={form.damage} maxLength={60} placeholder="2d10" onChange={(e) => setForm({ ...form, damage: e.target.value })} onBlur={() => form.damage !== t.damage && save({ damage: form.damage.trim() })} />
            </label>
            <label>
              {tr('Tipo')}
              <input
                list="trap-damage-types"
                value={form.damageType}
                maxLength={40}
                placeholder={tr('contundente')}
                onChange={(e) => setForm({ ...form, damageType: e.target.value })}
                onBlur={() => form.damageType !== t.damageType && save({ damageType: form.damageType.trim() })}
              />
              <datalist id="trap-damage-types">
                {DAMAGE_TYPE_SUGGESTIONS.map((d) => (
                  <option key={d} value={tr(d)} />
                ))}
              </datalist>
            </label>
          </div>
          {t.save && t.damage && (
            <label className="switch">
              <input type="checkbox" checked={t.half} onChange={(e) => void save({ half: e.target.checked })} />
              {tr('Mitad del daño si salva (si no, nada)')}
            </label>
          )}
        </fieldset>
      )}

      <label className="switch" title={trap ? tr('Al saltar, la trampa se ve y lo escondido dentro en la capa del DM aparece') : tr('Al saltar, lo escondido dentro en la capa del DM (p. ej. los monstruos de una emboscada) aparece')}>
        <input type="checkbox" checked={t.reveal} onChange={(e) => void save({ reveal: e.target.checked })} />
        {trap ? tr('Descubrirla al saltar (y lo escondido dentro)') : tr('Descubrir lo escondido dentro (emboscada)')}
      </label>
      {notes}
      <div className="row">
        <button className="ghost small danger" onClick={() => void deleteItem(scene.id, item.id)}>
          {tr('Borrar')}
        </button>
      </div>
      <p className="muted hint">{tr('Está en la capa del DM: los jugadores no la ven. Con la capa DM activa, arrástrala o cambia su tamaño desde las esquinas.')}</p>
    </div>
  );
}
