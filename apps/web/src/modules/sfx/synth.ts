import type { FxCueStyle } from '@vtt/shared';
import { useJukebox } from '../jukebox/store';

/**
 * Sonidos de efecto sintetizados con Web Audio: no hay ficheros que descargar ni que guardar en la Pi.
 * Todos usan el volumen general de la música (y se callan si está silenciada).
 */
export type SfxKind = FxCueStyle | 'dice' | 'crit' | 'fumble' | 'door-open' | 'door-close' | 'hit';

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** Medio segundo de ruido blanco, que se reutiliza para golpes, tajos y explosiones. */
function noiseOf(ctx: AudioContext) {
  if (noise) return noise;
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

interface Kit {
  ctx: AudioContext;
  out: GainNode;
  t0: number;
  /** Nota con envolvente rápida (y deslizando a otra frecuencia si se pide). */
  tone: (freq: number, start: number, dur: number, type: OscillatorType, opts?: { to?: number; gain?: number }) => void;
  /** Ruido filtrado: el filtro puede barrer de una frecuencia a otra. */
  hiss: (start: number, dur: number, filter: BiquadFilterType, freq: number, opts?: { to?: number; q?: number; gain?: number }) => void;
}

function kit(volume: number): Kit | null {
  const { master, muted } = useJukebox.getState();
  if (muted || master <= 0) return null;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    return null;
  }
  const ctx = audio;
  const out = ctx.createGain();
  out.gain.value = volume * master;
  out.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.02;
  const envelope = (g: GainNode, start: number, dur: number, peak: number) => {
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(peak, t0 + start + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
  };
  return {
    ctx,
    out,
    t0,
    tone(freq, start, dur, type, opts = {}) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + start);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + start + dur);
      envelope(g, start, dur, opts.gain ?? 1);
      osc.connect(g).connect(out);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    },
    hiss(start, dur, type, freq, opts = {}) {
      const src = ctx.createBufferSource();
      src.buffer = noiseOf(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = opts.q ?? 1;
      f.frequency.setValueAtTime(freq, t0 + start);
      if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + start + dur);
      const g = ctx.createGain();
      envelope(g, start, dur, opts.gain ?? 1);
      src.connect(f).connect(g).connect(out);
      src.start(t0 + start, Math.random() * 0.3);
      src.stop(t0 + start + dur + 0.05);
    },
  };
}

/** Cada sonido: qué notas y ruidos lleva. `delay` (s) retrasa el golpe hasta que llega el proyectil. */
const RECIPES: Record<SfxKind, (k: Kit, delay: number) => void> = {
  // Dados rodando: unos cuantos chasquidos cortos cada vez más espaciados.
  dice: (k) => {
    let t = 0;
    for (let i = 0; i < 7; i++) {
      k.hiss(t, 0.035, 'bandpass', 2500 + Math.random() * 2500, { q: 4, gain: 0.9 - i * 0.08 });
      t += 0.05 + i * 0.022 + Math.random() * 0.03;
    }
  },
  slash: (k) => {
    k.hiss(0, 0.2, 'bandpass', 4000, { to: 900, q: 1.5, gain: 0.9 });
    k.hiss(0.16, 0.12, 'lowpass', 900, { gain: 0.6 });
  },
  arrow: (k, delay) => {
    k.hiss(0, 0.12, 'highpass', 3000, { to: 6000, gain: 0.5 });
    k.tone(140, delay, 0.12, 'triangle', { to: 70, gain: 0.8 });
    k.hiss(delay, 0.06, 'lowpass', 1200, { gain: 0.6 });
  },
  bolt: (k, delay) => {
    k.tone(500, 0, Math.max(0.2, delay), 'sine', { to: 1400, gain: 0.5 });
    k.tone(1800, delay, 0.3, 'triangle', { to: 900, gain: 0.5 });
  },
  beam: (k) => {
    k.tone(110, 0, 0.7, 'sawtooth', { to: 130, gain: 0.35 });
    k.tone(220, 0, 0.7, 'square', { to: 260, gain: 0.12 });
    k.hiss(0, 0.7, 'bandpass', 3000, { q: 2, gain: 0.25 });
  },
  burst: (k, delay) => {
    k.hiss(0, Math.max(0.15, delay), 'bandpass', 600, { to: 2000, q: 1, gain: 0.25 });
    k.hiss(delay, 0.9, 'lowpass', 1800, { to: 120, gain: 1 });
    k.tone(90, delay, 0.7, 'sine', { to: 35, gain: 1 });
  },
  heal: (k) => {
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => k.tone(f, i * 0.08, 0.6, 'sine', { gain: 0.45 }));
  },
  aura: (k) => {
    [261.6, 329.6, 392].forEach((f) => k.tone(f, 0, 1.1, 'triangle', { gain: 0.3 }));
    k.tone(784, 0.15, 0.9, 'sine', { gain: 0.2 });
  },
  hit: (k) => {
    k.tone(120, 0, 0.15, 'sine', { to: 60, gain: 0.9 });
    k.hiss(0, 0.08, 'lowpass', 1500, { gain: 0.6 });
  },
  // Arpegio que sube (crítico) o «trombón triste» que baja (pifia).
  crit: (k) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => k.tone(f, i * 0.09, 0.5, 'triangle'));
    k.tone(1568, 0.36, 0.9, 'sine');
  },
  fumble: (k) => {
    [392, 370, 349.2].forEach((f, i) => k.tone(f, i * 0.3, 0.32, 'sawtooth'));
    k.tone(329.6, 0.9, 0.9, 'sawtooth', { to: 220 });
  },
  // Puerta: crujido de bisagra al abrir, golpe seco al cerrar.
  'door-open': (k) => {
    k.tone(70, 0, 0.55, 'sawtooth', { to: 110, gain: 0.35 });
    k.tone(95, 0.05, 0.45, 'sawtooth', { to: 160, gain: 0.2 });
    k.hiss(0, 0.5, 'bandpass', 700, { to: 1200, q: 6, gain: 0.4 });
  },
  'door-close': (k) => {
    k.tone(110, 0, 0.25, 'sine', { to: 45, gain: 1 });
    k.hiss(0, 0.12, 'lowpass', 900, { gain: 0.8 });
    k.hiss(0.1, 0.05, 'bandpass', 2500, { q: 5, gain: 0.3 });
  },
};

/** Volumen de cada sonido respecto al general (los críticos mandan). */
const LOUDNESS: Partial<Record<SfxKind, number>> = { crit: 0.18, fumble: 0.18, dice: 0.12, beam: 0.14 };

/** Para no amontonar el mismo sonido si llegan muchos a la vez (p. ej. una bola de fuego a 8 tokens). */
const lastAt: Partial<Record<SfxKind, number>> = {};

export function playSfx(kind: SfxKind, opts: { delay?: number; crit?: boolean } = {}) {
  const now = performance.now();
  if (now - (lastAt[kind] ?? 0) < 120) return;
  lastAt[kind] = now;
  const k = kit(LOUDNESS[kind] ?? 0.2);
  if (!k) return;
  try {
    RECIPES[kind](k, opts.delay ?? 0);
    // Un crítico pega más fuerte: un golpe grave extra al impactar.
    if (opts.crit) k.tone(70, opts.delay ?? 0, 0.5, 'sine', { to: 30, gain: 1 });
  } catch {
    /* sin audio */
  }
}
