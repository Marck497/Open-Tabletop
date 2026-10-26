import { useState } from 'react';
import { Line, Rect } from 'react-konva';
import type { Box, Scene } from '@vtt/shared';
import { useBoard } from '../board/store';
import { applyCalibration, stopCalibration, useGridCal } from './store';

/** Paleta flotante para ajustar la cuadrícula de una imagen de mapa a la de la escena (solo el DM). */
export function GridCalPanel({ scene }: { scene: Scene }) {
  const cal = useGridCal();
  const item = useBoard((s) => (cal.itemId ? s.items[cal.itemId] : undefined));
  const [width, setWidth] = useState('');
  if (!item) return null;
  const g = scene.gridSize;
  const num = (v: string) => Math.max(1, Math.min(200, Math.round(+v) || 1));
  // Al cambiar el ancho, el alto en proporción al rectángulo marcado (las casillas suelen ser cuadradas).
  const setCols = (cols: number) => cal.set({ cols, rows: cal.marked ? Math.max(1, Math.round((cols * cal.marked.height) / cal.marked.width)) : cal.rows });
  const total = +width > 0 ? Math.round(+width) : 0;

  return (
    <aside className="map-editor" aria-label="Ajustar cuadrícula">
      <div className="row spread">
        <strong>📐 Ajustar cuadrícula</strong>
        <button className="ghost small" title="Cancelar" onClick={stopCalibration}>
          ✕
        </button>
      </div>
      <p className="map-hint">
        Para que las casillas dibujadas en la imagen coincidan con las de la escena: <b>arrastra sobre la imagen un rectángulo que cubra justo unas casillas</b> de su
        cuadrícula. Cuantas más marques, más preciso (acerca el zoom con la rueda; botón derecho para moverte).
      </p>
      <p className="map-hint">{cal.marked ? `Marcado: ${Math.round(cal.marked.width)} × ${Math.round(cal.marked.height)} píxeles.` : 'Aún no has marcado nada.'}</p>
      <div className="row map-row">
        <span className="tool-label">Casillas</span>
        <input type="number" min={1} max={200} value={cal.cols} aria-label="Casillas de ancho" style={{ width: 56 }} onChange={(e) => setCols(num(e.target.value))} />
        ×
        <input type="number" min={1} max={200} value={cal.rows} aria-label="Casillas de alto" style={{ width: 56 }} onChange={(e) => cal.set({ rows: num(e.target.value) })} />
      </div>
      <p className="map-hint">Las líneas naranjas deben caer sobre las de la imagen.</p>
      <button className="small primary" disabled={!cal.marked} onClick={() => void applyCalibration()}>
        Aplicar
      </button>

      <div className="map-group">O, si sabes cuánto mide</div>
      <div className="row map-row">
        <span className="tool-label">Ancho</span>
        <input type="number" min={1} max={200} placeholder={String(Math.round(item.width / g))} value={width} aria-label="Casillas de ancho de la imagen" style={{ width: 64 }} onChange={(e) => setWidth(e.target.value)} />
        casillas
      </div>
      {total > 0 && (
        <p className="map-hint">
          Quedará de {total} × {+((item.height * total) / item.width).toFixed(1)} casillas.
        </p>
      )}
      <button className="small" disabled={!total} onClick={() => void applyCalibration(total)}>
        Aplicar ancho
      </button>

      <label className="switch" title="Lleva la imagen a la esquina y cambia el tamaño de la escena para que quepa entera">
        <input type="checkbox" checked={cal.fitScene} onChange={(e) => cal.set({ fitScene: e.target.checked })} />
        Ajustar la escena a la imagen
      </label>
    </aside>
  );
}

/** Lo que se ve en el tablero al calibrar: el contorno de la imagen y el rectángulo marcado partido en casillas. */
export function GridCalOverlay({ draft, scale }: { draft: Box | null; scale: number }) {
  const { itemId, marked, cols, rows } = useGridCal();
  const item = useBoard((s) => (itemId ? s.items[itemId] : undefined));
  if (!item) return null;
  const sw = 2 / scale;
  const box = draft ?? marked;
  const lines: number[][] = [];
  if (box && !draft) {
    for (let i = 1; i < cols; i++) lines.push([box.x + (box.width * i) / cols, box.y, box.x + (box.width * i) / cols, box.y + box.height]);
    for (let j = 1; j < rows; j++) lines.push([box.x, box.y + (box.height * j) / rows, box.x + box.width, box.y + (box.height * j) / rows]);
  }
  return (
    <>
      <Rect x={item.x} y={item.y} width={item.width} height={item.height} stroke="#5fb3e8" strokeWidth={sw} dash={[10 / scale, 6 / scale]} listening={false} />
      {box && <Rect x={box.x} y={box.y} width={box.width} height={box.height} stroke="#ff9e40" strokeWidth={sw} fill="rgba(255,158,64,0.12)" listening={false} />}
      {lines.map((p, i) => (
        <Line key={i} points={p} stroke="#ff9e40" strokeWidth={sw * 0.75} listening={false} />
      ))}
    </>
  );
}
