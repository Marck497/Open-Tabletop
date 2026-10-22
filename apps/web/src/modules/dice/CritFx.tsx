import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { naturalOutcome, type ChatMessage } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { useJukebox } from '../jukebox/store';

const FX_KEY = 'vtt:fx';
const SHOW_MS = 2600;

interface FxSettings {
  /** Animación a pantalla completa con los críticos y las pifias. */
  enabled: boolean;
  /** Con sonido (usa el volumen general de la música). */
  sound: boolean;
  set: (patch: Partial<Pick<FxSettings, 'enabled' | 'sound'>>) => void;
}

function readFx() {
  try {
    const v = JSON.parse(localStorage.getItem(FX_KEY) ?? 'null');
    if (v && typeof v.enabled === 'boolean') return { enabled: v.enabled, sound: !!v.sound };
  } catch {
    /* sin almacenamiento */
  }
  return { enabled: true, sound: true };
}

export const useFx = create<FxSettings>((set) => ({
  ...readFx(),
  set: (patch) =>
    set((s) => {
      const next = { enabled: patch.enabled ?? s.enabled, sound: patch.sound ?? s.sound };
      try {
        localStorage.setItem(FX_KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    }),
}));

let audio: AudioContext | null = null;

/** Sonido sintetizado: arpegio que sube (crítico) o "trombón triste" que baja (pifia). */
function playSound(kind: 'crit' | 'fumble') {
  const { master, muted } = useJukebox.getState();
  if (muted || master <= 0) return;
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = 0.18 * master;
    out.connect(ctx.destination);
    const note = (freq: number, start: number, dur: number, type: OscillatorType, slideTo?: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + start + dur);
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(1, t0 + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(g).connect(out);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    };
    if (kind === 'crit') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, i * 0.09, 0.5, 'triangle'));
      note(1568, 0.36, 0.9, 'sine');
    } else {
      [392, 370, 349.2].forEach((f, i) => note(f, i * 0.3, 0.32, 'sawtooth'));
      note(329.6, 0.9, 0.9, 'sawtooth', 220);
    }
  } catch {
    /* sin audio */
  }
}

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
      clearTimeout(timer);
      setShown({ id: m.id, kind, who: m.characterName ?? m.userName, label: m.roll?.label || m.roll?.expression || '', total: m.roll?.total ?? 0 });
      if (useFx.getState().sound) playSound(kind);
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
        <div className="crit-title">{crit ? '¡CRÍTICO!' : '¡PIFIA!'}</div>
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
  const { enabled, sound, set } = useFx();
  return (
    <div className="panel">
      <h3>Efectos</h3>
      <label className="switch">
        <input type="checkbox" checked={enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Animación de críticos y pifias
      </label>
      {enabled && (
        <label className="switch">
          <input type="checkbox" checked={sound} onChange={(e) => set({ sound: e.target.checked })} />
          Con sonido
        </label>
      )}
      <p className="muted hint">Solo en este dispositivo: cada jugador lo elige.</p>
    </div>
  );
}
