import type { ChatMessage, ChatRoll } from '@vtt/shared';

/** Muestra una tirada: quién, qué, los dados (los descartados tachados) y el total. */
export function RollDetail({ message, roll }: { message: ChatMessage; roll: ChatRoll }) {
  const who = message.characterName ? `${message.characterName} (${message.userName})` : message.userName;
  return (
    <div className="roll">
      <div className="roll-head">
        <strong>{who}</strong>
        {message.secret && <span className="badge gm">Secreta</span>}
      </div>
      {roll.label && <div className="roll-label">{roll.label}</div>}
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
    </div>
  );
}
