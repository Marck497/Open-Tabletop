import { useEffect, useState } from 'react';
import {
  AI_BEHAVIOR_LABELS,
  AI_BEHAVIORS,
  AI_TARGET_LABELS,
  AI_TARGETS,
  DEFAULT_TOKEN_AI,
  type AiBehavior,
  type AiTarget,
  type BoardItem,
  type TokenAi,
} from '@vtt/shared';
import { updateSelected } from '../board/actions';

/** Configuración de la IA de un token (en el panel del elemento seleccionado, solo DM). */
export function AiPanel({ item, hasSheet }: { item: BoardItem; hasSheet: boolean }) {
  const ai = item.ai;
  const [draft, setDraft] = useState<TokenAi>(ai ?? DEFAULT_TOKEN_AI);
  useEffect(() => setDraft(item.ai ?? DEFAULT_TOKEN_AI), [item.id, item.ai]);

  const save = (patch: Partial<TokenAi>) => void updateSelected({ ai: { ...draft, ...patch } });
  const text = (key: 'attackName' | 'attack' | 'damage') => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value }),
    onBlur: () => draft[key] !== (ai?.[key] ?? '') && save({}),
  });
  const num = (key: 'reach' | 'range' | 'guardRadius' | 'attackIndex', min: number) => ({
    type: 'number',
    min,
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft({ ...draft, [key]: Math.max(min, Math.round(Number(e.target.value) || min)) }),
    onBlur: () => draft[key] !== ai?.[key] && save({}),
  });

  return (
    <fieldset className="owners ai-panel">
      <legend>🤖 IA de enemigo</legend>
      <label className="switch">
        <input type="checkbox" checked={!!ai?.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        Actúa solo en su turno
      </label>
      {ai?.enabled && (
        <>
          <label>
            Comportamiento
            <select value={draft.behavior} onChange={(e) => save({ behavior: e.target.value as AiBehavior })}>
              {AI_BEHAVIORS.map((b) => (
                <option key={b} value={b}>
                  {AI_BEHAVIOR_LABELS[b]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Objetivo
            <select value={draft.target} onChange={(e) => save({ target: e.target.value as AiTarget })}>
              {AI_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {AI_TARGET_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            {draft.behavior === 'ranged' ? (
              <label>
                Alcance (casillas)
                <input {...num('range', 1)} />
              </label>
            ) : (
              <label>
                Alcance c/c (casillas)
                <input {...num('reach', 1)} />
              </label>
            )}
            {draft.behavior === 'guard' && (
              <label>
                Reacciona a (casillas)
                <input {...num('guardRadius', 1)} />
              </label>
            )}
            {draft.behavior === 'cautious' && (
              <label>
                Huye con menos de (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(draft.fleeBelow * 100)}
                  onChange={(e) => setDraft({ ...draft, fleeBelow: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                  onBlur={() => draft.fleeBelow !== ai?.fleeBelow && save({})}
                />
              </label>
            )}
          </div>
          <div className="field-row">
            <label>
              Velocidad
              <input
                type="number"
                min={0}
                placeholder={hasSheet ? 'la de su hoja' : '30'}
                value={draft.speed ?? ''}
                onChange={(e) => setDraft({ ...draft, speed: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                onBlur={() => draft.speed !== ai?.speed && save({})}
              />
            </label>
            {hasSheet && !draft.attack && (
              <label>
                Ataque de su hoja nº
                <input {...num('attackIndex', 0)} value={draft.attackIndex + 1} onChange={(e) => setDraft({ ...draft, attackIndex: Math.max(0, Math.round(Number(e.target.value)) - 1) })} />
              </label>
            )}
          </div>
          <label>
            Ataque {hasSheet && <small className="muted">(vacío = usa la tabla de ataques de su hoja)</small>}
            <input placeholder="Nombre, p. ej. Garras" maxLength={60} {...text('attackName')} />
          </label>
          <div className="field-row">
            <label>
              Tirada de ataque
              <input placeholder="1d20 + 5" maxLength={200} {...text('attack')} />
            </label>
            <label>
              Daño
              <input placeholder="2d6 + 3" maxLength={200} {...text('damage')} />
            </label>
          </div>
        </>
      )}
    </fieldset>
  );
}
