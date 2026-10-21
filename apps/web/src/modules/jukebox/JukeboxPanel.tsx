import { useRef, useState } from 'react';
import type { JukeboxAction } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { uploadAsset } from '../board/assets';
import { useJukebox } from './store';

/** Música (en la pestaña Mesa): el DM la controla; cada uno ajusta su volumen. */
export function JukeboxPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const state = useJukebox((s) => s.state);
  const master = useJukebox((s) => s.master);
  const muted = useJukebox((s) => s.muted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const act = (a: JukeboxAction) => emitAck('jukebox:action', { campaignId, ...a }).catch((e: Error) => setError(e.message));
  const tracks = state?.tracks ?? [];
  const playing = tracks.filter((t) => t.startedAt !== null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const asset = await uploadAsset(campaignId, f);
        await act({ type: 'add', assetId: asset.id });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3>Música</h3>
        {isGm && playing.length > 0 && (
          <button className="ghost small" onClick={() => void act({ type: 'stopAll' })}>
            ■ Parar todo
          </button>
        )}
      </div>
      <div className="row volume-row">
        <button className="ghost small" title={muted ? 'Activar' : 'Silenciar'} onClick={() => useJukebox.getState().setVolume({ muted: !muted })}>
          {muted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={master}
          aria-label="Mi volumen"
          onChange={(e) => useJukebox.getState().setVolume({ master: Number(e.target.value), muted: false })}
        />
      </div>
      {!isGm && <p className="muted hint">{playing.length ? `Suena: ${playing.map((t) => t.name).join(', ')}` : 'No suena nada.'}</p>}
      {isGm && (
        <>
          <ul className="track-list">
            {tracks.map((t) => (
              <li key={t.id} className={t.startedAt !== null ? 'playing' : ''}>
                <button className="small" title={t.startedAt !== null ? 'Parar' : 'Poner (para todos)'} onClick={() => void act({ type: t.startedAt !== null ? 'stop' : 'play', id: t.id })}>
                  {t.startedAt !== null ? '■' : '▶'}
                </button>
                <span className="track-name" title={t.name}>
                  {t.name}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={t.volume}
                  key={t.volume}
                  aria-label={`Volumen de ${t.name}`}
                  onMouseUp={(e) => void act({ type: 'update', id: t.id, patch: { volume: Number((e.target as HTMLInputElement).value) } })}
                  onKeyUp={(e) => void act({ type: 'update', id: t.id, patch: { volume: Number((e.target as HTMLInputElement).value) } })}
                />
                <button className={`ghost small ${t.loop ? 'on' : ''}`} title={t.loop ? 'En bucle' : 'Una vez'} onClick={() => void act({ type: 'update', id: t.id, patch: { loop: !t.loop } })}>
                  {t.loop ? '🔁' : '1×'}
                </button>
                <button className="ghost small danger" title="Quitar de la lista" onClick={() => void act({ type: 'remove', id: t.id })}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
          <button className="ghost small" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Subiendo…' : '+ Subir audio (MP3, OGG, WAV…)'}
          </button>
          <p className="muted hint">Puedes poner varias a la vez: música y lluvia, por ejemplo. Cada jugador ajusta su volumen.</p>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
