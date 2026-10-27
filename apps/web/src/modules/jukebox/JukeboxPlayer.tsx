import { useEffect, useRef } from 'react';
import { assetUrl, trackPosition, type JukeboxState, type JukeboxTrack } from '@vtt/shared';
import { emitAck, getSocket } from '../../core/socket';
import { useJukebox } from './store';
import { tr } from '../../core/i18n';

/**
 * Reproduce en este dispositivo lo que suena en la mesa, sincronizado con el
 * reloj del servidor. No pinta nada salvo el aviso de "activar sonido".
 */
export function JukeboxPlayer({ campaignId }: { campaignId: string }) {
  const state = useJukebox((s) => s.state);
  const master = useJukebox((s) => s.master);
  const muted = useJukebox((s) => s.muted);
  const blocked = useJukebox((s) => s.blocked);
  const audios = useRef(new Map<string, { el: HTMLAudioElement; startedAt: number }>());

  // Estado inicial y cambios.
  useEffect(() => {
    const j = useJukebox.getState;
    const load = () => emitAck('jukebox:get', { campaignId }).then(({ state, serverNow }) => j().set(state, serverNow));
    void load();
    const socket = getSocket();
    const onUpdate = ({ state, serverNow }: { state: JukeboxState; serverNow: number }) => state.campaignId === campaignId && j().set(state, serverNow);
    socket.on('jukebox:updated', onUpdate);
    socket.on('connect', load);
    const current = audios.current;
    return () => {
      socket.off('jukebox:updated', onUpdate);
      socket.off('connect', load);
      current.forEach(({ el }) => el.pause());
      current.clear();
      j().reset();
    };
  }, [campaignId]);

  // Arrancar, parar y ajustar cada pista.
  useEffect(() => {
    const playing = new Map((state?.tracks ?? []).filter((t) => t.startedAt !== null).map((t) => [t.id, t]));
    for (const [id, a] of audios.current) {
      const t = playing.get(id);
      if (!t || t.startedAt !== a.startedAt) {
        a.el.pause();
        audios.current.delete(id);
      }
    }
    for (const t of playing.values()) {
      let a = audios.current.get(t.id);
      if (!a) {
        a = { el: start(t), startedAt: t.startedAt! };
        audios.current.set(t.id, a);
      }
      a.el.loop = t.loop;
      a.el.volume = muted ? 0 : Math.min(1, t.volume * master);
    }
  }, [state, master, muted]);

  function start(t: JukeboxTrack): HTMLAudioElement {
    const el = new Audio(assetUrl(t.assetId));
    el.preload = 'auto';
    el.addEventListener(
      'loadedmetadata',
      () => {
        const now = Date.now() + useJukebox.getState().clockOffset;
        const pos = trackPosition(t.startedAt!, now, el.duration, t.loop);
        if (pos === null) return; // ya terminó
        el.currentTime = pos;
        el.play().catch(() => useJukebox.getState().setBlocked(true));
      },
      { once: true },
    );
    return el;
  }

  if (!blocked) return null;
  return (
    <button
      className="sound-unlock primary"
      onClick={() => {
        useJukebox.getState().setBlocked(false);
        for (const { el } of audios.current.values()) el.play().catch(() => useJukebox.getState().setBlocked(true));
      }}
    >
      {tr('🔈 Activar sonido')}
    </button>
  );
}
