/**
 * Música y ambiente: el DM pone pistas que suenan a la vez para toda la mesa.
 * Varias pueden sonar juntas (p. ej. música + lluvia).
 */
export interface JukeboxTrack {
  id: string;
  assetId: string;
  name: string;
  /** 0 a 1. Cada jugador tiene además su volumen general. */
  volume: number;
  loop: boolean;
  /** Cuándo empezó a sonar (ms del reloj del servidor); null = parada. */
  startedAt: number | null;
}

export interface JukeboxState {
  campaignId: string;
  tracks: JukeboxTrack[];
}

export type JukeboxAction =
  | { type: 'add'; assetId: string; name?: string }
  | { type: 'update'; id: string; patch: Partial<Pick<JukeboxTrack, 'name' | 'volume' | 'loop'>> }
  | { type: 'play'; id: string }
  | { type: 'stop'; id: string }
  | { type: 'stopAll' }
  | { type: 'remove'; id: string };

export const MAX_JUKEBOX_TRACKS = 100;

/** Por dónde debería ir una pista ahora mismo, en segundos (null = ya ha terminado). */
export function trackPosition(startedAt: number, now: number, duration: number, loop: boolean): number | null {
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  if (!Number.isFinite(duration) || duration <= 0) return elapsed;
  if (loop) return elapsed % duration;
  return elapsed < duration ? elapsed : null;
}

export const isAudioMime = (mime: string) => mime.startsWith('audio/');
