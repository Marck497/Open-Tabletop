import { useEffect, useState } from 'react';
import type { Scene, SceneLibraryEntry } from '@vtt/shared';
import { formatSize, IMPORT_ACCEPT, importSceneFile, listLibrary, placeLibraryEntry, removeLibraryEntry, renameLibraryEntry } from './api';
import { tr } from '../../core/i18n';

interface Props {
  campaignId: string;
  onClose: () => void;
  /** Se ha creado una escena en la partida (para abrirla). */
  onCreated: (scene: Scene) => void;
}

/** Biblioteca de escenas del DM: las que ha guardado de cualquier partida, para usarlas en esta. También importa archivos de escena. */
export function LibraryWindow({ campaignId, onClose, onCreated }: Props) {
  const [entries, setEntries] = useState<SceneLibraryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    listLibrary()
      .then(setEntries)
      .catch((e: Error) => setMessage(e.message));
  useEffect(() => void load(), []);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const place = (e: SceneLibraryEntry) =>
    run(async () => {
      const scene = await placeLibraryEntry(campaignId, e.id);
      onCreated(scene);
      setMessage(tr('«{name}» está ya en tus escenas.', { name: scene.name }));
    });

  const rename = (e: SceneLibraryEntry) => {
    const name = prompt(tr('Nombre en la biblioteca'), e.name)?.trim();
    if (name && name !== e.name) void run(() => renameLibraryEntry(e.id, name).then(load));
  };

  const remove = (e: SceneLibraryEntry) => {
    if (confirm(tr('¿Quitar «{name}» de la biblioteca? Las escenas que ya creaste con ella no se borran.', { name: e.name }))) void run(() => removeLibraryEntry(e.id).then(load));
  };

  const importFile = (file: File | undefined) =>
    file &&
    run(async () => {
      const scene = await importSceneFile(campaignId, file);
      onCreated(scene);
      setMessage(tr('«{name}» importada en tus escenas.', { name: scene.name }));
    });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal scene-library" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr('Biblioteca de escenas')}>
        <div className="row spread">
          <h2>{tr('📚 Biblioteca de escenas')}</h2>
          <button className="ghost small" onClick={onClose} title={tr('Cerrar')}>
            ✕
          </button>
        </div>
        <p className="muted">
          {tr('Escenas que has guardado (con')}{' '}<b>{tr('📚 Guardar en biblioteca')}</b>{tr(') para usarlas en cualquiera de tus partidas. Se copian con su mapa, paredes, luces, objetos y enemigos, pero sin los tokens de los jugadores.')}
        </p>
        {message && <p className="notice-line">{message}</p>}
        {entries === null ? (
          <p className="muted">{tr('Cargando…')}</p>
        ) : entries.length === 0 ? (
          <p className="muted">{tr('Aún no has guardado ninguna escena. Abre una y pulsa 📚 Guardar en biblioteca en la pestaña Escenas.')}</p>
        ) : (
          <ul className="library-list">
            {entries.map((e) => (
              <li key={e.id} className="row spread library-row">
                <span className="library-name" title={e.name}>
                  🗺 <strong>{e.name}</strong>
                  <small className="muted">
                    {' '}
                    {e.widthCells} × {e.heightCells} · {e.items} {e.items === 1 ? tr('elemento') : tr('elementos')} · {formatSize(e.size)}
                  </small>
                </span>
                <span className="row">
                  <button className="small primary" disabled={busy} onClick={() => void place(e)} title={tr('Crea una escena nueva en esta partida a partir de esta')}>
                    {tr('+ Usar aquí')}
                  </button>
                  <button className="ghost small" disabled={busy} onClick={() => rename(e)} title={tr('Renombrar')}>
                    ✎
                  </button>
                  <button className="ghost small danger" disabled={busy} onClick={() => remove(e)} title={tr('Quitar de la biblioteca')}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="row library-import">
          <label className="button-like ghost small" title={tr('Una escena exportada (.vtt-escena.json.gz) o un mapa de Dungeondraft, Dungeon Alchemist… (.dd2vtt, .uvtt)')}>
            {busy ? tr('Importando…') : tr('⬆ Importar archivo')}
            <input type="file" accept={IMPORT_ACCEPT} hidden disabled={busy} onChange={(e) => void importFile(e.target.files?.[0])} />
          </label>
          <small className="muted">{tr('Escenas que te pasen otros DM o mapas de Dungeondraft (.dd2vtt) y otros programas con formato Universal VTT, con sus paredes, puertas y luces.')}</small>
        </div>
      </div>
    </div>
  );
}
