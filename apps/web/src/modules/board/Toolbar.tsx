import { useState } from 'react';
import { BOARD_LAYERS, MEASURE_LABELS, MEASURE_SHAPES, WALL_COLORS, WALL_KINDS, WALL_LABELS, type DrawingType, type MeasureShape, type UpdateSceneInput } from '@vtt/shared';
import { api } from '../../core/api';
import { emitAck } from '../../core/socket';
import { addImageItem, addItem } from './actions';
import { AssetPicker } from './AssetPicker';
import { ToolMenu } from './ToolMenu';
import { saveWalls } from './Walls';
import { LAYER_LABELS, useBoard, type Tool } from './store';
import { useShortcutHelp } from '../shortcuts/Shortcuts';

const MEASURE_ICONS: Record<MeasureShape, string> = { ruler: '📏', circle: '◯', cone: '◺', line: '━', square: '▢' };
const MEASURE_HINTS: Record<MeasureShape, string> = {
  ruler: 'Arrastra para medir. Espacio añade un punto intermedio, Alt mide sin ajustar y Esc la quita.',
  circle: 'Arrastra desde el centro: radio del hechizo.',
  cone: 'Arrastra desde el origen hacia donde apunta el cono.',
  line: 'Arrastra la línea (1 casilla de ancho).',
  square: 'Arrastra desde una esquina: cubo.',
};

const DRAW_TYPES: { id: DrawingType; label: string; title: string }[] = [
  { id: 'path', label: '〰', title: 'A mano alzada' },
  { id: 'line', label: '╱', title: 'Línea recta' },
  { id: 'rect', label: '▭', title: 'Rectángulo' },
  { id: 'ellipse', label: '⬭', title: 'Elipse' },
  { id: 'text', label: 'T', title: 'Texto (clic donde quieras escribir)' },
];

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
  const draw = useBoard((s) => s.draw);
  const wallMode = useBoard((s) => s.wallMode);
  const previewVision = useBoard((s) => s.previewVision);
  const { setTool, setActiveLayer, setMeasureShape, setDraw, setWallMode, setPreviewVision } = useBoard.getState();
  const [picker, setPicker] = useState(false);

  if (!scene) return null;
  const fog = scene.fog;
  const w = scene.widthCells * scene.gridSize;
  const h = scene.heightCells * scene.gridSize;
  const setFog = (next: typeof fog) => void emitAck('fog:set', { sceneId: scene.id, fog: next });
  const saveScene = (patch: UpdateSceneInput) => void api.patch(`/scenes/${scene.id}`, patch).catch((e: Error) => useBoard.getState().showNotice(e.message));

  const tools = (
    <div className="tool-group" role="group" aria-label="Herramientas" data-tour="tools">
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
      <button className={`small ${tool === 'draw' ? 'active' : ''}`} title="Dibujar" aria-label="Dibujar" onClick={() => setTool('draw')}>
        ✏️
      </button>
      <button
        className={`small ${tool === 'ping' ? 'active' : ''}`}
        title={isGm ? 'Ping: clic para señalar un punto. Con Mayús, centra la vista de todos ahí.' : 'Ping: clic para señalar un punto a la mesa.'}
        onClick={() => setTool('ping')}
      >
        📍
      </button>
      <button className="small ghost" title="Atajos de teclado (?)" aria-label="Atajos de teclado" onClick={() => useShortcutHelp.getState().toggle()}>
        ⌨
      </button>
    </div>
  );

  const drawTools = tool === 'draw' && (
    <div className="tool-group" role="group" aria-label="Dibujo">
      {DRAW_TYPES.map((t) => (
        <button key={t.id} className={`small ${draw.type === t.id ? 'active' : ''}`} title={t.title} aria-label={t.title} onClick={() => setDraw({ type: t.id })}>
          {t.label}
        </button>
      ))}
      <input type="color" className="draw-color" value={draw.stroke} title="Color" onChange={(e) => setDraw({ stroke: e.target.value })} />
      <select value={draw.strokeWidth} title="Grosor" onChange={(e) => setDraw({ strokeWidth: Number(e.target.value) })}>
        {[2, 4, 8, 14].map((w) => (
          <option key={w} value={w}>
            {w} px
          </option>
        ))}
      </select>
      {(draw.type === 'rect' || draw.type === 'ellipse') && (
        <label className="switch">
          <input type="checkbox" checked={draw.filled} onChange={(e) => setDraw({ filled: e.target.checked })} />
          Relleno
        </label>
      )}
      {isGm && <span className="tool-label">en la capa {LAYER_LABELS[activeLayer]}</span>}
    </div>
  );

  if (!isGm)
    return (
      <div className="toolbar">
        {tools}
        {drawTools}
      </div>
    );

  return (
    <div className="toolbar">
      {tools}
      {drawTools}
      <div className="tool-group" data-tour="mapeditor">
        <button
          className={`small ${tool === 'map' ? 'active' : ''}`}
          title="Editor de mapas: pinta suelos, crea salas con paredes, pon puertas y objetos o genera una mazmorra"
          onClick={() => setTool(tool === 'map' ? 'select' : 'map')}
        >
          🗺️ Mapas
        </button>
      </div>

      <div className="tool-group" role="group" aria-label="Capa" data-tour="layers">
        <span className="tool-label">Capa</span>
        {BOARD_LAYERS.map((l) => (
          <button key={l} className={`small ${activeLayer === l ? 'active' : ''}`} onClick={() => setActiveLayer(l)}>
            {LAYER_LABELS[l]}
          </button>
        ))}
      </div>

      <div className="tool-group" data-tour="add">
        <button className="small" onClick={() => void addItem({ layer: activeLayer, width: scene.gridSize, height: scene.gridSize, name: 'Token', showName: true })}>
          + Token
        </button>
        <button className="small" onClick={() => setPicker(true)}>
          + Imagen
        </button>
      </div>

      <ToolMenu
        icon="☁"
        label="Niebla"
        title="Niebla de guerra: tapa el mapa y ve revelándolo"
        on={fog.enabled}
        data-tour="fog"
        inline={
          (tool === 'fog-reveal' || tool === 'fog-hide') &&
          FOG_TOOLS.map((t) => (
            <button key={t.id} className={`small ${tool === t.id ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.id)}>
              {t.label}
            </button>
          ))
        }
      >
        <label className="switch">
          <input type="checkbox" checked={fog.enabled} onChange={(e) => setFog({ ...fog, enabled: e.target.checked })} />
          Niebla activada
        </label>
        {fog.enabled && (
          <>
            <div className="tool-menu-row">
              {FOG_TOOLS.map((t) => (
                <button key={t.id} data-close className={`small ${tool === t.id ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="tool-menu-row">
              <button className="ghost small" data-close onClick={() => setFog({ enabled: true, ops: [{ mode: 'reveal', x: 0, y: 0, w, h }] })}>
                Revelar todo
              </button>
              <button className="ghost small" data-close onClick={() => setFog({ enabled: true, ops: [] })}>
                Tapar todo
              </button>
            </div>
          </>
        )}
      </ToolMenu>

      <div className="tool-group" role="group" aria-label="Paredes y visión" data-tour="vision">
        <button
          className={`small ${tool === 'walls' ? 'active' : ''}`}
          title="Paredes y puertas: arrastra para trazar (se ajusta a la cuadrícula; Alt, libre). Clic en una pared para cambiarle el tipo."
          onClick={() => setTool(tool === 'walls' ? 'select' : 'walls')}
        >
          🧱 Paredes
        </button>
        {tool === 'walls' && (
          <>
            {WALL_KINDS.map((k) => (
              <button key={k} className={`small ${wallMode === k ? 'active' : ''}`} style={{ borderBottom: `3px solid ${WALL_COLORS[k]}` }} onClick={() => setWallMode(k)}>
                {WALL_LABELS[k]}
              </button>
            ))}
            <button className={`small ${wallMode === 'erase' ? 'active' : ''}`} title="Clic en una pared para quitarla" onClick={() => setWallMode('erase')}>
              🧽 Borrar
            </button>
            {scene.walls.length > 0 && (
              <button className="ghost small" onClick={() => confirm(`¿Quitar las ${scene.walls.length} paredes de la escena?`) && void saveWalls(scene, [])}>
                Quitar todas
              </button>
            )}
          </>
        )}
        <ToolMenu
          icon="👁"
          label="Visión"
          title="Visión dinámica, alcance, lo explorado y la oscuridad"
          on={scene.vision}
          inline={
            previewVision && (
              <button className="small active" title="Estás viendo el tablero como los jugadores. Clic para volver a verlo todo." onClick={() => setPreviewVision(false)}>
                Viendo como jugadores ✕
              </button>
            )
          }
        >
          <label className="switch" title="Cada jugador solo ve lo que ven sus tokens; las paredes tapan la vista">
            <input type="checkbox" checked={scene.vision} onChange={(e) => saveScene({ vision: e.target.checked })} />
            Visión dinámica
          </label>
          {scene.vision && (
            <>
              <label className="switch" title="Hasta dónde ven los tokens, en casillas (0 = sin límite)">
                Alcance (casillas)
                <input
                  key={scene.visionRange}
                  type="number"
                  className="tiny-number"
                  min={0}
                  max={1000}
                  defaultValue={scene.visionRange}
                  onBlur={(e) => {
                    const v = Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0)));
                    if (v !== scene.visionRange) saveScene({ visionRange: v });
                  }}
                />
              </label>
              <label className="switch" title="Lo que ya han visto los tokens de los jugadores se queda a la vista en gris (sin mostrar quién está ahí ahora)">
                <input type="checkbox" checked={scene.exploration} onChange={(e) => saveScene({ exploration: e.target.checked })} />
                Recordar lo explorado
              </label>
              {scene.exploration && scene.explored && (
                <button
                  className="ghost small"
                  title="Olvida lo explorado en esta escena (se queda solo lo que ven ahora)"
                  onClick={() =>
                    confirm('¿Olvidar todo lo explorado en esta escena?') &&
                    void emitAck('explored:reset', { sceneId: scene.id }).catch((e: Error) => useBoard.getState().showNotice(e.message))
                  }
                >
                  Olvidar lo explorado
                </button>
              )}
              <label className="switch" title="La escena está a oscuras: los jugadores solo ven lo que alumbran las luces (antorchas, lámparas...) o su visión en la oscuridad">
                <input type="checkbox" checked={scene.lighting} onChange={(e) => saveScene({ lighting: e.target.checked })} />
                🌙 A oscuras
              </label>
              <label className="switch" title="Oscurece el tablero como lo ven los jugadores (con todos sus tokens)">
                <input type="checkbox" checked={previewVision} onChange={(e) => setPreviewVision(e.target.checked)} />
                Ver como jugadores
              </label>
            </>
          )}
        </ToolMenu>
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
