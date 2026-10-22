import type { ChatEffect } from '@vtt/shared';
import { AREA_SHAPE_LABELS, statusesOf } from '@vtt/shared';
import { useSheets } from '../sheets/store';
import { applyEffect, placeTemplate } from './actions';

/**
 * Resumen de lo que hace una creación en el chat (salvación, área, estados) con los botones
 * para colocar su plantilla de área y, el DM, aplicarlo a los tokens.
 */
export function EffectCard({ messageId, effect, isGm }: { messageId: string; effect: ChatEffect; isGm?: boolean }) {
  const template = useSheets((s) => s.template);
  const statuses = statusesOf(template);
  const chips: string[] = [];
  if (effect.save) chips.push(`Salvación de ${effect.save.label} CD ${effect.save.dc}${effect.save.half && effect.damage ? ' (mitad)' : ''}`);
  if (effect.damage) chips.push(`${effect.damage} de daño${effect.damageTypes.length ? ` (${effect.damageTypes.join(', ')})` : ''}`);
  if (effect.heal) chips.push(`cura ${effect.heal}`);
  if (effect.area) chips.push(`${AREA_SHAPE_LABELS[effect.area.shape].split(' (')[0]} de ${effect.area.size} pies`);
  for (const c of effect.conditions) {
    const s = statuses.find((x) => x.id === c);
    chips.push(s ? `${s.icon} ${s.label}` : c);
  }
  const canApply = isGm && (effect.damage > 0 || effect.heal > 0 || effect.conditions.length > 0 || !!effect.save);
  if (!chips.length && !canApply) return null;
  return (
    <div className="effect-card">
      {chips.map((c, i) => (
        <span key={i} className="effect-chip">
          {c}
        </span>
      ))}
      <span className="effect-actions">
        {effect.area && (
          <button className="ghost small" onClick={() => placeTemplate(effect)} title="Colocar la plantilla de área en el tablero con su tamaño">
            📐 Plantilla
          </button>
        )}
        {canApply && (
          <button className="ghost small" onClick={() => void applyEffect(messageId, effect.name)} title="Aplicar a los tokens de la plantilla de área (o al seleccionado): salvaciones, daño, curación y estados">
            🎯 Aplicar
          </button>
        )}
      </span>
    </div>
  );
}
