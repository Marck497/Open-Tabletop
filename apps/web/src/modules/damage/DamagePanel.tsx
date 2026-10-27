import { useState } from 'react';
import { DAMAGE_TYPE_SUGGESTIONS, type DamageKind } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { currentTargets } from '../homebrew/actions';
import { useSheets } from '../sheets/store';
import { tr } from '../../core/i18n';

/**
 * Daño o curación a mano (solo DM, en el panel del elemento seleccionado). Va al token
 * seleccionado o, si hay una plantilla de área puesta, a los tokens que cubre. El servidor tira
 * los dados, aplica resistencias y PG temporales, y avisa a la concentración.
 */
export function DamagePanel({ campaignId }: { campaignId: string }) {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply(kind: DamageKind) {
    if (!amount.trim() || busy) return;
    const targets = currentTargets();
    if (!targets.length) {
      alert(tr('Selecciona un token o coloca la plantilla de área encima de los objetivos.'));
      return;
    }
    if (targets.length > 1) {
      const names = targets.map((t) => t.name || useSheets.getState().characters[t.characterId ?? '']?.name || 'token');
      if (!confirm(tr('¿{0} a {1}?', { '0': kind === 'heal' ? tr('Curar') : tr('Hacer daño'), '1': names.join(', ') }))) return;
    }
    setBusy(true);
    try {
      await emitAck('damage:apply', { campaignId, itemIds: targets.map((t) => t.id), kind, amount, type: kind === 'heal' ? '' : type });
      setAmount('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="owners" data-tour="damage">
      <legend>{tr('❤ Daño y curación')}</legend>
      <div className="field-row">
        <label>
          {tr('Cantidad')}
          <input
            value={amount}
            maxLength={100}
            placeholder={tr('8 o 2d6 + 3')}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void apply('damage')}
          />
        </label>
        <label>
          {tr('Tipo de daño')}
          <input value={type} maxLength={40} list="damage-types" placeholder={tr('Sin tipo')} onChange={(e) => setType(e.target.value)} />
          <datalist id="damage-types">
            {DAMAGE_TYPE_SUGGESTIONS.map((t) => (
              <option key={t} value={tr(t)} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="row">
        <button className="small" disabled={!amount.trim() || busy} onClick={() => void apply('damage')} title={tr('Resta PG (primero los temporales) teniendo en cuenta resistencias, inmunidades y vulnerabilidades')}>
          {tr('🩸 Daño')}
        </button>
        <button className="ghost small" disabled={!amount.trim() || busy} onClick={() => void apply('heal')} title={tr('Suma PG sin pasar del máximo')}>
          {tr('💚 Curar')}
        </button>
      </div>
      <p className="muted hint">{tr('Va al token seleccionado o, si has colocado una plantilla de área, a todos los que cubre. Los dados se tiran en el servidor y el resumen sale en el chat.')}</p>
    </fieldset>
  );
}
