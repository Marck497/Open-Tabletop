import { useState } from 'react';
import { BOARD_LAYERS, MEASURE_LABELS, MEASURE_SHAPES, type MeasureShape } from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { addImageItem, addItem } from './actions';
import { AssetPicker } from './AssetPicker';
import { LAYER_LABELS, useBoard, type Tool } from './store';

const MEASURE_ICONS: Record<MeasureShape, string> = { ruler: '📏', circle: '◯', cone: '◺', line: '━', square: '▢' };
const MEASURE_HINTS: Record<MeasureShape, string> = {
  ruler: 'Arrastra para medir. Espacio añade un punto intermedio, Alt mide sin ajustar y Esc la quita.',
  circle: 'Arrastra desde el centro: radio del hechizo.',
  cone: 'Arrastra desde el origen hacia donde apunta el cono.',
  line: 'Arrastra la línea (1 casilla de ancho).',
  square: 'Arrastra desde una esquina: cubo.',
};

const FOG_TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'fog-reveal', label: '☀ Revelar', title: 'Arrastra para revelar una zona de la niebla' },
  { id: 'fog-hide', label: '☁ Ocultar', title: 'Arrastra para volver a ocultar una zona' },
];

/** Barra de herramientas del tablero (medir y señalar para todos; capas, elementos y niebla para el DM). */
export function Toolbar({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const scene = useBoard((s) => s.scene);
  const tool = useBoard((s) => s.tool);
  const activeLayer = useBoard((s) => s.activeLayer);
  const measureShape = useBoard((s) => s.measureShape);
  const { setTool, setActiveLayer, setMeasureShape } = useBoard.getState();
  const [picker, setPicker] = useState(false);

  if (!scene) return null;
  const fog = scene.fog;
  const w = scene.widthCells * scene.gridSize;
  const h = scene.heightCells * scene.gridSize;
  const setFog = (next: typeof fog) => void emitAck('fog:set', { sceneId: scene.id, fog: next });

  const tools = (
    <div className="tool-group" role="group" aria-label="Herramientas">
      <button className={`small ${tool === 'select' ? 'active' : ''}`} title="Seleccionar y mover (arrastra el fondo para desplazarte, rueda para zoom, doble clic para hacer ping)" onClick={() => setTool('select')}>
        ✋
      </button>
      {MEASURE_SHAPES.map((m) => (
        <button
          key={m}
          className={`small ${tool === 'measure' && measureShape === m ? 'active' : ''}`}
          title={`${MEASURE_LABELS[m]}: ${MEASURE_HINTS[m]}`}
          aria-label={MEASURE_LABELS[m]}
          onClick={() => setMeasureShape(m)}
        >
          {MEASURE_ICONS[m]}
        </button>
      ))}
      <button
        className={`small ${tool === 'ping' ? 'active' : ''}`}
        title={isGm ? 'Ping: clic para señalar un punto. Con Mayús, centra la vista de todos ahí.' : 'Ping: clic para señalar un punto a la mesa.'}
        onClick={() => setTool('ping')}
      >
        📍
      </button>
    </div>
  );

  if (!isGm) return <div className="toolbar">{tools}</div>;

  return (
    <div className="toolbar">
      {tools}
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
          FOG_TOOLS.map((t) => (
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
