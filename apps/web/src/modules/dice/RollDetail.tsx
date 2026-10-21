import type { RollResult } from '@vtt/shared';

/** Muestra una tirada: quién, qué, los dados (los descartados tachados) y el total. */
export function RollDetail({ roll }: { roll: RollResult }) {
  const who = roll.characterName ? `${roll.characterName} (${roll.userName})` : roll.userName;
  return (
    <div className="roll">
      <div className="roll-head">
        <strong>{who}</strong>
        {roll.secret && <span className="badge gm">Secreta</span>}
      </div>
      {roll.label && <div className="roll-label">{roll.label}</div>}
      <div className="roll-body">
        <span className="roll-expr">
          {roll.expression}
          {roll.rolls.length > 0 && ' → '}
          {roll.rolls.map((d, i) => (
            <span key={i} className="roll-dice">
              [
              {d.results.map((v, j) => (
                <span key={j} className={`${d.kept.includes(j) ? '' : 'dropped'} ${v === d.sides ? 'crit' : v === 1 ? 'fumble' : ''}`}>
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
