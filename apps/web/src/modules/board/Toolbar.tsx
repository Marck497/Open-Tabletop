import { useState } from 'react';
import { BOARD_LAYERS } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { addImageItem, addItem } from './actions';
import { AssetPicker } from './AssetPicker';
import { LAYER_LABELS, useBoard, type Tool } from './store';

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'select', label: '✋ Mover', title: 'Seleccionar y mover (arrastra el fondo para desplazarte, rueda para zoom)' },
  { id: 'fog-reveal', label: '☀ Revelar', title: 'Arrastra para revelar una zona de la niebla' },
  { id: 'fog-hide', label: '☁ Ocultar', title: 'Arrastra para volver a ocultar una zona' },
];

/** Barra de herramientas del DM. */
export function Toolbar({ campaignId }: { campaignId: string }) {
  const scene = useBoard((s) => s.scene);
  const tool = useBoard((s) => s.tool);
  const activeLayer = useBoard((s) => s.activeLayer);
  const { setTool, setActiveLayer } = useBoard.getState();
  const [picker, setPicker] = useState(false);

  if (!scene) return null;
  const fog = scene.fog;
  const w = scene.widthCells * scene.gridSize;
  const h = scene.heightCells * scene.gridSize;
  const setFog = (next: typeof fog) => void emitAck('fog:set', { sceneId: scene.id, fog: next });

  return (
    <div className="toolbar">
      <div className="tool-group" role="group" aria-label="Capa">
        <span className="tool-label">Capa</span>
        {BOARD_LAYERS.map((l) => (
          <button key={l} className={`small ${activeLayer === l ? 'active' : ''}`} onClick={() => setActiveLayer(l)}>
            {LAYER_LABELS[l]}
          </button>
        ))}
      </div>

      <div className="tool-group">
        <button className="small" onClick={() => void addItem({ layer: activeLayer, width: scene.gridSize, height: scene.gridSize, name: 'Token', showName: true })}>
          + Token
        </button>
        <button className="small" onClick={() => setPicker(true)}>
          + Imagen
        </button>
      </div>

      <div className="tool-group" role="group" aria-label="Niebla">
        <label className="switch">
          <input type="checkbox" checked={fog.enabled} onChange={(e) => setFog({ ...fog, enabled: e.target.checked })} />
          Niebla
        </label>
        {fog.enabled &&
          TOOLS.map((t) => (
            <button key={t.id} className={`small ${tool === t.id ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.id)}>
              {t.label}
            </button>
          ))}
        {fog.enabled && (
          <>
            <button className="ghost small" onClick={() => setFog({ enabled: true, ops: [{ mode: 'reveal', x: 0, y: 0, w, h }] })}>
              Revelar todo
            </button>
            <button className="ghost small" onClick={() => setFog({ enabled: true, ops: [] })}>
              Tapar todo
            </button>
          </>
        )}
      </div>

      {picker && (
        <AssetPicker
          campaignId={campaignId}
          onClose={() => setPicker(false)}
          onPick={(asset) => {
            setPicker(false);
            void addImageItem(asset, activeLayer);
          }}
        />
      )}
    </div>
  );
}
