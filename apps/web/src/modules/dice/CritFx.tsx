import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { naturalOutcome, type ChatMessage } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { playSfx } from '../sfx/synth';
import { tr } from '../../core/i18n';
import { LangSelect } from '../../components/LangSelect';

const FX_KEY = 'vtt:fx';
const SHOW_MS = 2600;

interface FxSettings {
  /** Animación a pantalla completa con los críticos y las pifias. */
  enabled: boolean;
  /** Sonidos de efecto: dados, ataques, puertas y críticos (usan el volumen general de la música). */
  sound: boolean;
  /** Animaciones de ataques y hechizos sobre el tablero. */
  board: boolean;
  /** Dados 3D que ruedan en una bandeja con cada tirada. */
  dice3d: boolean;
  set: (patch: Partial<Pick<FxSettings, 'enabled' | 'sound' | 'board' | 'dice3d'>>) => void;
}

function readFx() {
  try {
    const v = JSON.parse(localStorage.getItem(FX_KEY) ?? 'null');
    if (v && typeof v.enabled === 'boolean') return { enabled: v.enabled, sound: !!v.sound, board: v.board !== false, dice3d: v.dice3d !== false };
  } catch {
    /* sin almacenamiento */
  }
  return { enabled: true, sound: true, board: true, dice3d: true };
}

export const useFx = create<FxSettings>((set) => ({
  ...readFx(),
  set: (patch) =>
    set((s) => {
      const next = { enabled: patch.enabled ?? s.enabled, sound: patch.sound ?? s.sound, board: patch.board ?? s.board, dice3d: patch.dice3d ?? s.dice3d };
      try {
        localStorage.setItem(FX_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    }),
}));

interface Shown {
  id: string;
  kind: 'crit' | 'fumble';
  who: string;
  label: string;
  total: number;
}

/** Animación para toda la mesa cuando alguien saca un 20 o un 1 natural en un d20. */
export function CritFx({ campaignId }: { campaignId: string }) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const socket = getSocket();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMessage = (m: ChatMessage) => {
      if (m.campaignId !== campaignId || m.kind !== 'roll' || !useFx.getState().enabled) return;
      const kind = naturalOutcome(m.roll);
      if (!kind) return;
      // Con los dados 3D, primero se ve caer el dado y luego llega la animación.
      clearTimeout(timer);
      timer = setTimeout(() => show(m, kind), useFx.getState().dice3d ? 1000 : 0);
    };
    const show = (m: ChatMessage, kind: 'crit' | 'fumble') => {
      setShown({ id: m.id, kind, who: m.characterName ?? m.userName, label: m.roll?.label || m.roll?.expression || '', total: m.roll?.total ?? 0 });
      if (useFx.getState().sound) playSfx(kind);
      // La pifia sacude la pantalla.
      if (kind === 'fumble') {
        document.body.classList.remove('fx-shake');
        void document.body.offsetWidth;
        document.body.classList.add('fx-shake');
      }
      timer = setTimeout(() => {
        setShown(null);
        document.body.classList.remove('fx-shake');
      }, SHOW_MS);
    };
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
      clearTimeout(timer);
      document.body.classList.remove('fx-shake');
    };
  }, [campaignId]);

  // Chispas con ángulos y distancias al azar (una vez por tirada).
  const sparks = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        angle: (i / 28) * 360 + Math.random() * 10,
        dist: 180 + Math.random() * 220,
        delay: Math.random() * 0.15,
        size: 4 + Math.random() * 7,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown?.id],
  );

  if (!shown) return null;
  const crit = shown.kind === 'crit';
  return (
    <div className={`crit-fx ${shown.kind}`} key={shown.id} onClick={() => setShown(null)} role="status" aria-live="polite">
      <div className="crit-flash" />
      {crit && (
        <div className="crit-sparks">
          {sparks.map((s, i) => (
            <span
              key={i}
              style={{ '--a': `${s.angle}deg`, '--d': `${s.dist}px`, '--s': `${s.size}px`, animationDelay: `${s.delay}s` } as React.CSSProperties}
            />
          ))}
        </div>
      )}
      <div className="crit-card">
        <div className="crit-die">{crit ? '20' : '1'}</div>
        <div className="crit-title">{crit ? tr('¡CRÍTICO!') : tr('¡PIFIA!')}</div>
        <div className="crit-sub">
          {shown.who}
          {shown.label ? ` · ${shown.label}` : ''} · {shown.total}
        </div>
      </div>
    </div>
  );
}

/** Opciones de los efectos en este dispositivo (pestaña Mesa). */
export function FxPanel() {
  const { enabled, sound, board, dice3d, set } = useFx();
  return (
    <div className="panel">
      <h3>{tr('Efectos')}</h3>
      <label className="switch">
        <input type="checkbox" checked={enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {tr('Animación de críticos y pifias')}
      </label>
      <label className="switch">
        <input type="checkbox" checked={board} onChange={(e) => set({ board: e.target.checked })} />
        {tr('Animaciones de ataques y hechizos en el tablero')}
      </label>
      <label className="switch">
        <input type="checkbox" checked={sound} onChange={(e) => set({ sound: e.target.checked })} />
        {tr('Sonidos (dados, ataques, hechizos, puertas y críticos)')}
      </label>
      <label className="switch">
        <input type="checkbox" checked={dice3d} onChange={(e) => set({ dice3d: e.target.checked })} />
        {tr('Dados 3D al tirar')}
      </label>
      <label>
        {tr('Idioma')} <LangSelect />
      </label>
      <p className="muted hint">{tr('Para apuntar: Alt+clic en un token (o clic en uno que no sea tuyo) antes de atacar.')}</p>
      <p className="muted hint">{tr('Solo en este dispositivo: cada jugador lo elige.')}</p>
    </div>
  );
}
