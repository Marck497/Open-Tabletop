import { useState } from 'react';
import { DIAGONAL_LABELS, DIAGONAL_RULES, type CampaignMember, type DiagonalRule, type Scene, type UpdateSceneInput } from '@vtt/shared';
import { api } from '../../core/api';
import { newFolder, newScene, SceneTree, useSceneList } from './SceneTree';
import { duplicateScene, exportSceneUrl, IMPORT_ACCEPT, importSceneFile, saveToLibrary } from '../scenelib/api';
import { LibraryWindow } from '../scenelib/LibraryWindow';
import { NotesList } from '../notes/NotesList';
import { AdventureWindow } from '../adventure/AdventureWindow';
import { TriggersList } from '../triggers/TriggersList';
import { useBoard } from './store';

interface Props {
  campaignId: string;
  activeSceneId: string | null;
  viewingId: string | null;
  members: CampaignMember[];
  onView: (sceneId: string) => void;
}

/** Lista de escenas del DM: abrir, crear, ordenar en carpetas, configurar y llevar a los jugadores. */
export function ScenesPanel({ campaignId, activeSceneId, viewingId, members, onView }: Props) {
  const { scenes, folders } = useSceneList(campaignId);
  const [editing, setEditing] = useState(false);
  const [library, setLibrary] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adventure, setAdventure] = useState(false);
  const viewing = scenes.find((s) => s.id === viewingId);
  const boardSceneId = useBoard((s) => s.scene?.id);

  async function run(work: () => Promise<string | void>) {
    setMessage(null);
    try {
      const done = await work();
      if (done) setMessage(done);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  const duplicate = (scene: Scene) =>
    run(async () => {
      const copy = await duplicateScene(scene.id);
      onView(copy.id);
      return `Copia creada: «${copy.name}».`;
    });

  const [importing, setImporting] = useState(false);
  const importFile = (file: File | undefined) =>
    file &&
    run(async () => {
      setImporting(true);
      try {
        const scene = await importSceneFile(campaignId, file);
        onView(scene.id);
        return `«${scene.name}» importada: ${scene.widthCells} × ${scene.heightCells} casillas${scene.walls.length ? `, ${scene.walls.length} paredes y puertas` : ''}.`;
      } finally {
        setImporting(false);
      }
    });

  const keep = (scene: Scene) =>
    run(async () => {
      const name = prompt('Nombre en tu biblioteca', scene.name)?.trim();
      if (!name) return;
      await saveToLibrary(scene.id, name);
      return `«${name}» guardada en tu biblioteca: ábrela con 📚 Biblioteca desde cualquiera de tus partidas.`;
    });

  async function remove(scene: Scene) {
    if (!confirm(`¿Borrar la escena "${scene.name}" y todo lo que contiene?`)) return;
    await api.delete(`/scenes/${scene.id}`);
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3>Escenas</h3>
        <span className="row">
          <button className="ghost small" onClick={() => setLibrary(true)} title="Escenas guardadas para usarlas en cualquier partida, e importar archivos de escena">
            📚 Biblioteca
          </button>
          <label className="button-like ghost small" title="Importa un mapa de Dungeondraft, Dungeon Alchemist… (.dd2vtt, .uvtt) con sus paredes, puertas y luces, o una escena exportada">
            {importing ? 'Importando…' : '⬆ Importar'}
            <input type="file" accept={IMPORT_ACCEPT} hidden disabled={importing} onChange={(e) => void importFile(e.target.files?.[0])} />
          </label>
          <button className="ghost small" onClick={() => void newFolder(campaignId)}>
            + Carpeta
          </button>
          <button className="ghost small" onClick={() => void newScene(campaignId, scenes.length).then((s) => s && onView(s.id))}>
            + Nueva
          </button>
          <button className="ghost small" onClick={() => setAdventure(true)} title="Crea una escena lista para jugar: mapa amueblado, notas, encuentros escondidos, trampas y tesoro">
            ✨ Aventura rápida
          </button>
        </span>
      </div>
      <SceneTree campaignId={campaignId} scenes={scenes} folders={folders} members={members} partySceneId={activeSceneId} viewingId={viewingId} onView={onView} />
      {viewing && (
        <>
          <div className="row scene-actions">
            <button className="ghost small" onClick={() => void duplicate(viewing)} title="Copia esta escena (mapa, paredes, objetos y enemigos) justo debajo, sin los tokens de los jugadores">
              ⧉ Duplicar
            </button>
            <button className="ghost small" onClick={() => void keep(viewing)} title="Guarda una copia para usarla en cualquiera de tus partidas">
              📚 Guardar en biblioteca
            </button>
            <a className="button-like ghost small" href={exportSceneUrl(viewing.id)} download title="Descarga la escena como archivo (con sus imágenes) para pasarla a otro DM o a otro servidor">
              ⬇ Exportar
            </a>
          </div>
          <button className="ghost small" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Ocultar ajustes' : 'Ajustes de la escena'}
          </button>
          {editing && <SceneSettings key={viewing.id} scene={viewing} onDelete={() => void remove(viewing)} />}
          {boardSceneId === viewing.id && <NotesList campaignId={campaignId} />}
          {boardSceneId === viewing.id && <TriggersList />}
        </>
      )}
      {message && <p className="notice-line">{message}</p>}
      {adventure && (
        <AdventureWindow
          campaignId={campaignId}
          onClose={() => setAdventure(false)}
          onCreated={(scene, text) => {
            setAdventure(false);
            setMessage(text);
            onView(scene.id);
          }}
        />
      )}
      {library && <LibraryWindow campaignId={campaignId} onClose={() => setLibrary(false)} onCreated={(scene) => onView(scene.id)} />}
    </div>
  );
}

function SceneSettings({ scene, onDelete }: { scene: Scene; onDelete: () => void }) {
  const [form, setForm] = useState(scene);
  const save = (patch: UpdateSceneInput) => void api.patch(`/scenes/${scene.id}`, patch);
  const num = (key: 'widthCells' | 'heightCells' | 'gridSize') => ({
    type: 'number',
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: Number(e.target.value) }),
    onBlur: () => form[key] !== scene[key] && form[key] > 0 && save({ [key]: form[key] }),
  });

  return (
    <div className="scene-settings">
      <label>
        Nombre
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => form.name && form.name !== scene.name && save({ name: form.name })} />
      </label>
      <div className="field-row">
        <label>
          Ancho (casillas)
          <input min={1} max={200} {...num('widthCells')} />
        </label>
        <label>
          Alto (casillas)
          <input min={1} max={200} {...num('heightCells')} />
        </label>
      </div>
      <div className="field-row">
        <label>
          Tamaño casilla (px)
          <input min={10} max={300} {...num('gridSize')} />
        </label>
        <label>
          Fondo
          <input type="color" value={form.backgroundColor} onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })} onBlur={() => save({ backgroundColor: form.backgroundColor })} />
        </label>
      </div>
      <div className="field-row">
        <label>
          Cada casilla son
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={form.cellDistance}
            onChange={(e) => setForm({ ...form, cellDistance: Number(e.target.value) })}
            onBlur={() => form.cellDistance > 0 && form.cellDistance !== scene.cellDistance && save({ cellDistance: form.cellDistance })}
          />
        </label>
        <label>
          Unidad
          <input value={form.distanceUnit} maxLength={16} onChange={(e) => setForm({ ...form, distanceUnit: e.target.value })} onBlur={() => form.distanceUnit !== scene.distanceUnit && save({ distanceUnit: form.distanceUnit })} />
        </label>
      </div>
      <label>
        Diagonales
        <select
          value={form.diagonalRule}
          onChange={(e) => {
            const diagonalRule = e.target.value as DiagonalRule;
            setForm({ ...form, diagonalRule });
            save({ diagonalRule });
          }}
        >
          {DIAGONAL_RULES.map((r) => (
            <option key={r} value={r}>
              {DIAGONAL_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="switch">
        <input
          type="checkbox"
          checked={form.gridVisible}
          onChange={(e) => {
            setForm({ ...form, gridVisible: e.target.checked });
            save({ gridVisible: e.target.checked });
          }}
        />
        Mostrar cuadrícula
      </label>
      <button className="ghost small danger" onClick={onDelete}>
        Borrar escena
      </button>
    </div>
  );
}
