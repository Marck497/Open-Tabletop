import { useState } from 'react';
import { DIAGONAL_LABELS, DIAGONAL_RULES, type CampaignMember, type DiagonalRule, type Scene, type UpdateSceneInput } from '@vtt/shared';
import { api } from '../../core/api';
import { newFolder, newScene, SceneTree, useSceneList } from './SceneTree';

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
  const viewing = scenes.find((s) => s.id === viewingId);

  async function remove(scene: Scene) {
    if (!confirm(`¿Borrar la escena "${scene.name}" y todo lo que contiene?`)) return;
    await api.delete(`/scenes/${scene.id}`);
  }

  return (
    <div className="panel">
      <div className="row spread">
        <h3>Escenas</h3>
        <span className="row">
          <button className="ghost small" onClick={() => void newFolder(campaignId)}>
            + Carpeta
          </button>
          <button className="ghost small" onClick={() => void newScene(campaignId, scenes.length).then((s) => s && onView(s.id))}>
            + Nueva
          </button>
        </span>
      </div>
      <SceneTree campaignId={campaignId} scenes={scenes} folders={folders} members={members} partySceneId={activeSceneId} viewingId={viewingId} onView={onView} />
      {viewing && (
        <>
          <button className="ghost small" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Ocultar ajustes' : 'Ajustes de la escena'}
          </button>
          {editing && <SceneSettings key={viewing.id} scene={viewing} onDelete={() => void remove(viewing)} />}
        </>
      )}
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
