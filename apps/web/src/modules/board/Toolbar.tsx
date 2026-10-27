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
import { tr } from '../../core/i18n';

const MEASURE_ICONS: Record<MeasureShape, string> = { ruler: '📏', circle: '◯', cone: '◺', line: '━', square: '▢' };
const MEASURE_HINTS: Record<MeasureShape, string> = {
  ruler: tr('Arrastra para medir. Sin soltar, clic derecho o Espacio añade un punto de giro, Alt mide sin ajustar y Esc la quita.'),
  circle: tr('Arrastra desde el centro: radio del hechizo.'),
  cone: tr('Arrastra desde el origen hacia donde apunta el cono.'),
  line: tr('Arrastra la línea (1 casilla de ancho).'),
  square: tr('Arrastra desde una esquina: cubo.'),
};

const DRAW_TYPES: { id: DrawingType; label: string; title: string }[] = [
  { id: 'path', label: '〰', title: tr('A mano alzada') },
  { id: 'line', label: '╱', title: tr('Línea recta') },
  { id: 'rect', label: '▭', title: tr('Rectángulo') },
  { id: 'ellipse', label: '⬭', title: tr('Elipse') },
  { id: 'text', label: 'T', title: tr('Texto (clic donde quieras escribir)') },
];

const FOG_TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'fog-reveal', label: tr('☀ Revelar'), title: tr('Arrastra para revelar una zona de la niebla') },
  { id: 'fog-hide', label: tr('☁ Ocultar'), title: tr('Arrastra para volver a ocultar una zona') },
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
    <div className="tool-group" role="group" aria-label={tr('Herramientas')} data-tour="tools">
      <button className={`small ${tool === 'select' ? 'active' : ''}`} title={tr('Seleccionar y mover (arrastra el fondo para desplazarte, rueda para zoom, doble clic para hacer ping)')} onClick={() => setTool('select')}>
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
      <button className={`small ${tool === 'draw' ? 'active' : ''}`} title={tr('Dibujar')} aria-label={tr('Dibujar')} onClick={() => setTool('draw')}>
        ✏️
      </button>
      <button
        className={`small ${tool === 'ping' ? 'active' : ''}`}
        title={isGm ? tr('Ping: clic para señalar un punto. Con Mayús, centra la vista de todos ahí.') : tr('Ping: clic para señalar un punto a la mesa.')}
        onClick={() => setTool('ping')}
      >
        📍
      </button>
      <button className="small ghost" title={tr('Atajos de teclado (?)')} aria-label={tr('Atajos de teclado')} onClick={() => useShortcutHelp.getState().toggle()}>
        ⌨
      </button>
    </div>
  );

  const drawTools = tool === 'draw' && (
    <div className="tool-group" role="group" aria-label={tr('Dibujo')}>
      {DRAW_TYPES.map((t) => (
        <button key={t.id} className={`small ${draw.type === t.id ? 'active' : ''}`} title={t.title} aria-label={t.title} onClick={() => setDraw({ type: t.id })}>
          {t.label}
        </button>
      ))}
      <input type="color" className="draw-color" value={draw.stroke} title={tr('Color')} onChange={(e) => setDraw({ stroke: e.target.value })} />
      <select value={draw.strokeWidth} title={tr('Grosor')} onChange={(e) => setDraw({ strokeWidth: Number(e.target.value) })}>
        {[2, 4, 8, 14].map((w) => (
          <option key={w} value={w}>
            {w} px
          </option>
        ))}
      </select>
      {(draw.type === 'rect' || draw.type === 'ellipse') && (
        <label className="switch">
          <input type="checkbox" checked={draw.filled} onChange={(e) => setDraw({ filled: e.target.checked })} />
          {tr('Relleno')}
        </label>
      )}
      {isGm && <span className="tool-label">{tr('en la capa')}{' '}{LAYER_LABELS[activeLayer]}</span>}
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
          title={tr('Editor de mapas: pinta suelos, crea salas con paredes, pon puertas y objetos o genera una mazmorra')}
          onClick={() => setTool(tool === 'map' ? 'select' : 'map')}
        >
          {tr('🗺️ Mapas')}
        </button>
      </div>

      <div className="tool-group" role="group" aria-label={tr('Capa')} data-tour="layers">
        <span className="tool-label">{tr('Capa')}</span>
        {BOARD_LAYERS.map((l) => (
          <button key={l} className={`small ${activeLayer === l ? 'active' : ''}`} onClick={() => setActiveLayer(l)}>
            {LAYER_LABELS[l]}
          </button>
        ))}
      </div>

      <div className="tool-group" data-tour="add">
        <button className="small" onClick={() => void addItem({ layer: activeLayer, width: scene.gridSize, height: scene.gridSize, name: tr('Token'), showName: true })}>
          {tr('+ Token')}
        </button>
        <button className="small" onClick={() => setPicker(true)}>
          {tr('+ Imagen')}
        </button>
      </div>

      <ToolMenu
        icon="☁"
        label={tr('Niebla')}
        title={tr('Niebla de guerra: tapa el mapa y ve revelándolo')}
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
          {tr('Niebla activada')}
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
                {tr('Revelar todo')}
              </button>
              <button className="ghost small" data-close onClick={() => setFog({ enabled: true, ops: [] })}>
                {tr('Tapar todo')}
              </button>
            </div>
          </>
        )}
      </ToolMenu>

      <div className="tool-group" role="group" aria-label={tr('Paredes y visión')} data-tour="vision">
        <button
          className={`small ${tool === 'walls' ? 'active' : ''}`}
          title={tr('Paredes y puertas: arrastra para trazar (se ajusta a la cuadrícula; Alt, libre). Clic en una pared para cambiarle el tipo.')}
          onClick={() => setTool(tool === 'walls' ? 'select' : 'walls')}
        >
          {tr('🧱 Paredes')}
        </button>
        {tool === 'walls' && (
          <>
            {WALL_KINDS.map((k) => (
              <button key={k} className={`small ${wallMode === k ? 'active' : ''}`} style={{ borderBottom: `3px solid ${WALL_COLORS[k]}` }} onClick={() => setWallMode(k)}>
                {WALL_LABELS[k]}
              </button>
            ))}
            <button className={`small ${wallMode === 'erase' ? 'active' : ''}`} title={tr('Clic en una pared para quitarla')} onClick={() => setWallMode('erase')}>
              {tr('🧽 Borrar')}
            </button>
            {scene.walls.length > 0 && (
              <button className="ghost small" onClick={() => confirm(tr('¿Quitar las {length} paredes de la escena?', { length: scene.walls.length })) && void saveWalls(scene, [])}>
                {tr('Quitar todas')}
              </button>
            )}
          </>
        )}
        <ToolMenu
          icon="👁"
          label={tr('Visión')}
          title={tr('Visión dinámica, alcance, lo explorado y la oscuridad')}
          on={scene.vision}
          inline={
            previewVision && (
              <button className="small active" title={tr('Estás viendo el tablero como los jugadores. Clic para volver a verlo todo.')} onClick={() => setPreviewVision(false)}>
                {tr('Viendo como jugadores ✕')}
              </button>
            )
          }
        >
          <label className="switch" title={tr('Cada jugador solo ve lo que ven sus tokens; las paredes tapan la vista')}>
            <input type="checkbox" checked={scene.vision} onChange={(e) => saveScene({ vision: e.target.checked })} />
            {tr('Visión dinámica')}
          </label>
          {scene.vision && (
            <>
              <label className="switch" title={tr('Hasta dónde ven los tokens, en casillas (0 = sin límite)')}>
                {tr('Alcance (casillas)')}
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
              <label className="switch" title={tr('Lo que ya han visto los tokens de los jugadores se queda a la vista en gris (sin mostrar quién está ahí ahora)')}>
                <input type="checkbox" checked={scene.exploration} onChange={(e) => saveScene({ exploration: e.target.checked })} />
                {tr('Recordar lo explorado')}
              </label>
              {scene.exploration && scene.explored && (
                <button
                  className="ghost small"
                  title={tr('Olvida lo explorado en esta escena (se queda solo lo que ven ahora)')}
                  onClick={() =>
                    confirm(tr('¿Olvidar todo lo explorado en esta escena?')) &&
                    void emitAck('explored:reset', { sceneId: scene.id }).catch((e: Error) => useBoard.getState().showNotice(e.message))
                  }
                >
                  {tr('Olvidar lo explorado')}
                </button>
              )}
              <label className="switch" title={tr('La escena está a oscuras: los jugadores solo ven lo que alumbran las luces (antorchas, lámparas...) o su visión en la oscuridad')}>
                <input type="checkbox" checked={scene.lighting} onChange={(e) => saveScene({ lighting: e.target.checked })} />
                {tr('🌙 A oscuras')}
              </label>
              <label className="switch" title={tr('Oscurece el tablero como lo ven los jugadores (con todos sus tokens)')}>
                <input type="checkbox" checked={previewVision} onChange={(e) => setPreviewVision(e.target.checked)} />
                {tr('Ver como jugadores')}
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
