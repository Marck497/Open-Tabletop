import type { ChatMessage, ChatRoll, ChatRollPart } from '@vtt/shared';
import { EffectCard } from '../homebrew/EffectCard';
import { tr } from '../../core/i18n';

/** Muestra una tirada: quién, qué, los dados (los descartados tachados) y el total; y el efecto de una creación. */
export function RollDetail({ message, roll, isGm }: { message: ChatMessage; roll: ChatRoll; isGm?: boolean }) {
  const who = message.characterName ? `${message.characterName} (${message.userName})` : message.userName;
  return (
    <div className="roll">
      <div className="roll-head">
        <strong>{who}</strong>
        {message.secret && <span className="badge gm">{tr('Secreta')}</span>}
      </div>
      {roll.label && <div className="roll-label">{roll.label}</div>}
      {roll.expression && <RollLine roll={roll} />}
      {roll.parts?.map((p, i) => (
        <div key={i} className="roll-part">
          <div className="roll-label">{p.label}</div>
          <RollLine roll={p} />
        </div>
      ))}
      {message.text && <div className="roll-text">{message.text}</div>}
      {roll.effect && <EffectCard messageId={message.id} effect={roll.effect} isGm={isGm} />}
    </div>
  );
}

/** Expresión, dados (los descartados tachados) y total. */
function RollLine({ roll }: { roll: ChatRollPart }) {
  return (
    <div className="roll-body">
      <span className="roll-expr">
        {roll.expression}
        {roll.rolls.length > 0 && ' → '}
        {roll.rolls.map((d, i) => (
          <span key={i} className="roll-dice" title={d.expr}>
            [
            {d.results.map((v, j) => (
              <span key={j} className={`${d.kept.includes(j) ? '' : 'dropped'} ${d.sides === 20 && v === 20 ? 'crit' : d.sides === 20 && v === 1 ? 'fumble' : ''}`}>
                {j > 0 && ', '}
                {v}
              </span>
            ))}
            ]
          </span>
        ))}
      </span>
      <span className="roll-total">{roll.total}</span>
    </div>
  );
}
