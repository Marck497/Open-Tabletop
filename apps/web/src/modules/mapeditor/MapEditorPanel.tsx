import { useEffect } from 'react';
import { MAP_SIZE_LABELS, MAP_SIZES, MAP_STYLE_DEFS, MAP_STYLES, PREFAB_GROUPS, PREFABS, prefabById, rotatePrefab, TERRAIN_GROUPS, TERRAINS, terrainById, type Scene } from '@vtt/shared';
import { useBoard } from '../board/store';
import { clearTerrain, generate, isFreshlyGenerated, redo, undo, useMapEditor, type MapTool } from './store';
import { texturePreview } from './textures';

const TOOLS: { id: MapTool; icon: string; label: string; key: string; hint: string }[] = [
  { id: 'brush', icon: '🖌️', label: 'Pincel', key: 'B', hint: 'Arrastra para pintar el suelo.' },
  { id: 'rect', icon: '▭', label: 'Rectángulo', key: 'R', hint: 'Arrastra para rellenar un rectángulo.' },
  { id: 'fill', icon: '🪣', label: 'Rellenar', key: 'G', hint: 'Clic para rellenar la zona del mismo suelo.' },
  { id: 'erase', icon: '🧽', label: 'Borrar', key: 'E', hint: 'Arrastra para quitar el suelo.' },
  { id: 'room', icon: '🏠', label: 'Habitación', key: 'H', hint: 'Arrastra para crear una sala con sus paredes. Si toca otra sala, se unen.' },
  { id: 'door', icon: '🚪', label: 'Puerta', key: 'P', hint: 'Clic en el borde de una casilla para poner o quitar una puerta.' },
  { id: 'picker', icon: '💧', label: 'Cuentagotas', key: 'I', hint: 'Clic en el mapa para coger ese suelo.' },
  { id: 'stamp', icon: '🌲', label: 'Objetos', key: 'O', hint: 'Clic para colocar el objeto elegido (luego se mueve o gira con ✋ en la capa Mapa).' },
  { id: 'prefab', icon: '🏛️', label: 'Salas prediseñadas', key: 'S', hint: 'Elige una sala y haz clic en el mapa para colocarla con su suelo, puertas, muebles y luces. T la gira.' },
];

const STAMPS: Record<string, string[]> = {
  Naturaleza: ['🌲', '🌳', '🌴', '🌵', '🪨', '🍄', '🌾', '🌻', '🪵', '🌿', '🌊', '🔥'],
  Mobiliario: ['🪑', '🛏️', '🛋️', '🚪', '🪜', '🕯️', '🛢️', '📦', '🧰', '🗄️', '🍺', '🪔', '🍖', '🎪'],
  Mazmorra: ['💀', '🦴', '⚰️', '⛓️', '🗿', '⛲', '🕸️', '💎', '💰', '🗝️', '⚗️', '📜', '📚', '🪤', '🏺', '⚔️', '🛡️'],
  Lugares: ['🏰', '🏠', '🛖', '⛺', '⛩️', '🗼', '⛪', '🏚️', '🌉', '⚓', '⛵', '🐎'],
  Señales: ['❌', '⭐', '⚠️', '🏳️', '🪧', '🎯', '❓', '❗', '➡️', '⬆️'],
};

const BRUSHES = [1, 2, 3, 5, 8];

/** Paleta flotante del editor de mapas (solo el DM). */
export function MapEditorPanel({ scene }: { scene: Scene }) {
  const ed = useMapEditor();
  const canUndo = ed.undo.some((s) => s.sceneId === scene.id);
  const canRedo = ed.redo.some((s) => s.sceneId === scene.id);
  const painted = /[^.]/.test(scene.terrain);
  const tool = TOOLS.find((t) => t.id === ed.mode)!;

  // Atajos de teclado.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const { setMode, setBrush, brush, mode, rotatePrefab: turn } = useMapEditor.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (mode === 'prefab' && e.key.toLowerCase() === 't') return turn();
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
      if (t) setMode(t.id);
      const i = BRUSHES.indexOf(brush);
      if (e.key === '[' && i > 0) setBrush(BRUSHES[i - 1]!);
      if (e.key === ']' && i < BRUSHES.length - 1) setBrush(BRUSHES[i + 1]!);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <aside className="map-editor" aria-label="Editor de mapas">
      <div className="row spread">
        <strong>🗺️ Editor de mapas</strong>
        <button className="ghost small" title="Cerrar el editor" onClick={() => useBoard.getState().setTool('select')}>
          ✕
        </button>
      </div>

      <div className="map-tools" role="group" aria-label="Herramientas del mapa">
        {TOOLS.map((t) => (
          <button key={t.id} className={`small ${ed.mode === t.id ? 'active' : ''}`} title={`${t.label} (${t.key}): ${t.hint}`} aria-label={t.label} onClick={() => ed.setMode(t.id)}>
            {t.icon}
          </button>
        ))}
      </div>
      <p className="map-hint">
        <b>{tool.label}.</b> {tool.hint}
      </p>

      {(ed.mode === 'brush' || ed.mode === 'erase') && (
        <div className="row map-row">
          <span className="tool-label">Tamaño</span>
          {BRUSHES.map((b) => (
            <button key={b} className={`small ${ed.brush === b ? 'active' : ''}`} title={`${b}×${b} casillas ([ y ] para cambiarlo)`} onClick={() => ed.setBrush(b)}>
              {b}
            </button>
          ))}
        </div>
      )}

      {ed.mode === 'prefab' ? (
        <PrefabPicker />
      ) : ed.mode === 'stamp' ? (
        <>
          <div className="row map-row">
            <span className="tool-label">Tamaño</span>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} className={`small ${ed.stampSize === n ? 'active' : ''}`} title={`${n}×${n} casillas`} onClick={() => ed.setStampSize(n)}>
                {n}
              </button>
            ))}
          </div>
          {Object.entries(STAMPS).map(([group, list]) => (
            <div key={group}>
              <div className="map-group">{group}</div>
              <div className="map-stamps">
                {list.map((s) => (
                  <button key={s} className={`stamp ${ed.stamp === s ? 'active' : ''}`} onClick={() => ed.setStamp(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        TERRAIN_GROUPS.map((group) => (
          <div key={group}>
            <div className="map-group">{group}</div>
            <div className="map-swatches">
              {TERRAINS.filter((t) => t.group === group).map((t) => (
                <button
                  key={t.id}
                  className={`swatch ${ed.code === t.id && ed.mode !== 'erase' ? 'active' : ''}`}
                  style={{ backgroundImage: `url(${texturePreview(t.id)})` }}
                  title={t.solid ? `${t.name} (hace de pared)` : t.name}
                  aria-label={t.name}
                  onClick={() => ed.setCode(t.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}
      {ed.mode !== 'stamp' && ed.mode !== 'prefab' && <div className="map-current">Suelo: {terrainById(ed.code)?.name}</div>}

      <label className="switch" title="Las paredes se ponen solas donde el suelo toca el vacío o un muro (las que pongas a mano se respetan)">
        <input type="checkbox" checked={ed.autoWalls} onChange={(e) => ed.setAutoWalls(e.target.checked)} />
        Paredes automáticas
      </label>

      <div className="row map-row">
        <button className="small" disabled={!canUndo} title="Deshacer (Ctrl+Z)" onClick={undo}>
          ↶ Deshacer
        </button>
        <button className="small" disabled={!canRedo} title="Rehacer (Ctrl+Y)" onClick={redo}>
          ↷ Rehacer
        </button>
      </div>

      <Generator scene={scene} painted={painted} />
      <p className="map-hint">Rueda para el zoom; botón central o derecho para moverte por el mapa.</p>
    </aside>
  );
}

/** Lista de salas prediseñadas, la elegida con su descripción y el botón de girar. */
function PrefabPicker() {
  const ed = useMapEditor();
  const current = prefabById(ed.prefab);
  const size = current ? rotatePrefab(current, ed.prefabTurns) : null;
  return (
    <>
      {PREFAB_GROUPS.map((group) => (
        <div key={group}>
          <div className="map-group">{group}</div>
          <div className="map-prefabs">
            {PREFABS.filter((p) => p.group === group).map((p) => (
              <button key={p.id} className={`small ${ed.prefab === p.id ? 'active' : ''}`} title={p.description} onClick={() => ed.setPrefab(p.id)}>
                {p.icon} {p.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {current && size && (
        <div className="map-prefab-info">
          <p className="map-hint">
            <b>
              {current.icon} {current.name}
            </b>{' '}
            ({size.w} × {size.h}). {current.description}
            {current.outdoor && ' Es de exterior: queda mejor sobre hierba o tierra ya pintada (si alrededor está vacío, las paredes automáticas la rodean).'}
          </p>
          <button className="small" onClick={ed.rotatePrefab} title="Girar un cuarto de vuelta (T)">
            ↻ Girar
          </button>
        </div>
      )}
    </>
  );
}

/** Generar un mapa al azar: estilo, cuántas salas y si se amuebla. Se puede pulsar varias veces hasta que guste. */
function Generator({ scene, painted }: { scene: Scene; painted: boolean }) {
  const ed = useMapEditor();
  const def = MAP_STYLE_DEFS[ed.genStyle];
  const cave = ed.genStyle === 'cave';
  const run = () => {
    if (painted && !isFreshlyGenerated(scene) && !confirm('Se sustituirá el mapa actual (se puede deshacer con Ctrl+Z). ¿Seguir?')) return;
    void generate(scene);
  };
  return (
    <>
      <div className="map-group">Generar al azar</div>
      <div className="map-prefabs" role="group" aria-label="Estilo del mapa">
        {MAP_STYLES.map((st) => (
          <button key={st} className={`small ${ed.genStyle === st ? 'active' : ''}`} title={MAP_STYLE_DEFS[st].description} onClick={() => ed.setGen({ genStyle: st })}>
            {MAP_STYLE_DEFS[st].icon} {MAP_STYLE_DEFS[st].name}
          </button>
        ))}
      </div>
      <p className="map-hint">{def.description}</p>
      <div className="row map-row">
        <select value={ed.genSize} onChange={(e) => ed.setGen({ genSize: e.target.value as typeof ed.genSize })} aria-label="Tamaño">
          {MAP_SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {cave ? { few: 'Más roca', normal: 'Normal', many: 'Más abierta' }[sz] : MAP_SIZE_LABELS[sz]}
            </option>
          ))}
        </select>
        <label className="switch" title="Pone objetos según el uso de cada sala (almacén, tumbas, armería…) y luces">
          <input type="checkbox" checked={ed.genFurnish} onChange={(e) => ed.setGen({ genFurnish: e.target.checked })} />
          Amueblar
        </label>
      </div>
      <div className="row map-row">
        <button className="small primary" disabled={ed.genBusy} onClick={run} title="Genera un mapa nuevo del tamaño de la escena. Púlsalo otra vez para probar otro.">
          {ed.genBusy ? 'Generando…' : '🎲 Generar'}
        </button>
        {painted && (
          <button className="ghost small" onClick={() => confirm('¿Borrar todo el suelo pintado, sus paredes automáticas y los muebles generados?') && void clearTerrain(scene)}>
            Limpiar
          </button>
        )}
      </div>
    </>
  );
}
