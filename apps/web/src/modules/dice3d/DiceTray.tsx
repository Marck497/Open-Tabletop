import { useEffect, useState } from 'react';
import type { ChatMessage, DiceRoll } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { useFx } from '../dice/CritFx';

/**
 * Dados 3D animados: cada tirada que llega al chat rueda en una bandeja sobre el tablero y
 * se para en el resultado que ya ha decidido el servidor (aquí no se tira nada, solo se enseña).
 * Hecho con CSS 3D, sin librerías: el d6 es un cubo de verdad y el resto, fichas con la forma de su dado.
 */
const SHOW_MS = 3800;
const MAX_DICE = 12;
const MAX_TRAYS = 2;

interface Die {
  key: string;
  sides: number;
  value: number;
  kept: boolean;
  /** Giro y retraso al azar para que no caigan todos igual. */
  spin: number;
  delay: number;
}

interface Tray {
  id: string;
  who: string;
  total: number;
  dice: Die[];
  more: number;
}

/** Los dados de una tirada (la principal y sus partes), con su resultado. */
export function diceOf(m: ChatMessage): { dice: Omit<Die, 'spin' | 'delay'>[]; more: number } {
  const groups: DiceRoll[] = [...(m.roll?.rolls ?? []), ...(m.roll?.parts ?? []).flatMap((p) => p.rolls)];
  const all = groups.flatMap((g, gi) => g.results.map((value, i) => ({ key: `${gi}-${i}`, sides: g.sides, value, kept: g.kept.includes(i) })));
  return { dice: all.slice(0, MAX_DICE), more: Math.max(0, all.length - MAX_DICE) };
}

export function DiceTray({ campaignId }: { campaignId: string }) {
  const [trays, setTrays] = useState<Tray[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onMessage = (m: ChatMessage) => {
      if (m.campaignId !== campaignId || m.kind !== 'roll' || !useFx.getState().dice3d) return;
      const { dice, more } = diceOf(m);
      if (!dice.length) return;
      const tray: Tray = {
        id: m.id,
        who: m.characterName ?? m.userName,
        total: m.roll?.total ?? 0,
        more,
        dice: dice.map((d, i) => ({ ...d, spin: Math.floor(Math.random() * 4) * 90 + 360, delay: i * 0.06 + Math.random() * 0.08 })),
      };
      setTrays((list) => [...list.slice(-(MAX_TRAYS - 1)), tray]);
      const t = setTimeout(() => {
        timers.delete(t);
        setTrays((list) => list.filter((x) => x.id !== m.id));
      }, SHOW_MS);
      timers.add(t);
    };
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
      timers.forEach(clearTimeout);
    };
  }, [campaignId]);

  if (!trays.length) return null;
  return (
    <div className="dice-trays" aria-hidden="true">
      {trays.map((t) => (
        <div key={t.id} className="dice-tray" onClick={() => setTrays((list) => list.filter((x) => x.id !== t.id))}>
          <div className="dice-row">
            {t.dice.map((d) => (
              <Die3D key={d.key} die={d} />
            ))}
            {t.more > 0 && <span className="dice-more">+{t.more}</span>}
          </div>
          <div className="dice-caption">
            {t.who} · <strong>{t.total}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Giro final del cubo para dejar cada número de cara. */
const CUBE_FACES: Record<number, [number, number]> = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };

function Die3D({ die }: { die: Die }) {
  const tone = die.sides === 20 && die.value === 20 ? 'max' : die.sides === 20 && die.value === 1 ? 'min' : '';
  const style = { '--spin': `${die.spin}deg`, animationDelay: `${die.delay}s` } as React.CSSProperties;
  if (die.sides === 6) {
    const [rx, ry] = CUBE_FACES[die.value] ?? [0, 0];
    return (
      <div className={`die3d ${die.kept ? '' : 'dropped'}`} style={style}>
        <div className="cube" style={{ '--rx': `${rx}deg`, '--ry': `${ry}deg`, animationDelay: `${die.delay}s` } as React.CSSProperties}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} className={`face f${n}`}>
              {n}
            </span>
          ))}
        </div>
      </div>
    );
  }
  const shape = SHAPES[die.sides] ?? SHAPES[0]!;
  const face = (back: boolean) => (
    <svg className={`token-face ${back ? 'back' : ''}`} viewBox="0 0 100 100">
      <polygon points={shape} />
      {!back && (
        <text x="50" y={die.sides === 4 ? 66 : 58} textAnchor="middle" dominantBaseline="middle" fontSize={die.value >= 100 ? 26 : 34}>
          {die.value}
        </text>
      )}
    </svg>
  );
  return (
    <div className={`die3d ${die.kept ? '' : 'dropped'} ${tone}`} style={style} title={`d${die.sides}: ${die.value}`}>
      <div className="token" style={{ animationDelay: `${die.delay}s` }}>
        {face(false)}
        {face(true)}
      </div>
      <span className="die-sides">d{die.sides}</span>
    </div>
  );
}

/** Silueta de cada dado (el 0 vale para los raros: d2, d3, d100...). */
const SHAPES: Record<number, string> = {
  0: '50,4 93,27 93,73 50,96 7,73 7,27',
  4: '50,6 96,90 4,90',
  8: '50,3 95,50 50,97 5,50',
  10: '50,3 94,40 50,97 6,40',
  12: '50,4 95,37 78,93 22,93 5,37',
  20: '50,3 93,27 93,73 50,97 7,73 7,27',
};
