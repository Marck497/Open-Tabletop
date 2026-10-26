import { useRef, useState } from 'react';
import { Line, Rect, Text } from 'react-konva';
import {
  fitPrefab,
  floodFill,
  isSolidCell,
  nearestCellEdge,
  normalizeTerrain,
  paintBrush,
  paintRect,
  prefabById,
  rotatePrefab,
  terrainById,
  TERRAIN_EMPTY,
  type Point,
  type Scene,
} from '@vtt/shared';
import { useBoard } from '../board/store';
import { commitTerrain, placeItems, placePrefab, remember, toggleDoorAt, useMapEditor } from './store';

interface Cell {
  x: number;
  y: number;
}

/** Casillas de la línea de A a B (para que el pincel no deje huecos al mover rápido). */
function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  for (let i = 1; i <= n; i++) out.push({ x: Math.round(a.x + ((b.x - a.x) * i) / n), y: Math.round(a.y + ((b.y - a.y) * i) / n) });
  return out;
}

/** Ratón del editor de mapas sobre el tablero: pintar, rectángulos, cubo, puertas y objetos, con su vista previa. */
export function useMapPointer(scene: Scene | null, scale: number) {
  const [hover, setHover] = useState<Point | null>(null);
  const [rect, setRect] = useState<{ a: Cell; b: Cell } | null>(null);
  const last = useRef<Cell | null>(null);
  const draft = useMapEditor((s) => s.draft);
  const mode = useMapEditor((s) => s.mode);
  const brush = useMapEditor((s) => s.brush);
  const code = useMapEditor((s) => s.code);
  const stampSize = useMapEditor((s) => s.stampSize);
  const stamp = useMapEditor((s) => s.stamp);
  const prefabId = useMapEditor((s) => s.prefab);
  const prefabTurns = useMapEditor((s) => s.prefabTurns);

  if (!scene) return { onDown: () => {}, onMove: () => {}, onUp: () => {}, onLeave: () => {}, overlay: null };
  const { widthCells: w, heightCells: h, gridSize: g } = scene;
  const cellOf = (p: Point): Cell => ({ x: Math.floor(p.x / g), y: Math.floor(p.y / g) });
  const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < w && c.y < h;
  const current = () => normalizeTerrain(useBoard.getState().scene?.terrain ?? '', w, h);
  const paintCode = () => (useMapEditor.getState().mode === 'erase' ? TERRAIN_EMPTY : useMapEditor.getState().code);

  function onDown(p: Point) {
    const c = cellOf(p);
    const ed = useMapEditor.getState();
    switch (ed.mode) {
      case 'brush':
      case 'erase': {
        remember(scene!);
        last.current = c;
        ed.setDraft(paintBrush(current(), w, h, c.x, c.y, ed.brush, paintCode()));
        return;
      }
      case 'rect':
      case 'room':
        setRect({ a: c, b: c });
        return;
      case 'fill':
        if (!inside(c)) return;
        remember(scene!);
        void commitTerrain(scene!, floodFill(current(), w, h, c.x, c.y, ed.code));
        return;
      case 'picker': {
        const picked = current()[c.y * w + c.x];
        if (picked && picked !== TERRAIN_EMPTY) ed.setCode(picked);
        ed.setMode('brush');
        return;
      }
      case 'door':
        void toggleDoorAt(scene!, nearestCellEdge(p.x, p.y, g));
        return;
      case 'stamp': {
        if (!inside(c)) return;
        const size = ed.stampSize * g;
        void placeItems(scene!, [{ layer: 'map', x: c.x * g, y: c.y * g, width: size, height: size, drawing: { type: 'stamp', text: ed.stamp } }]);
        return;
      }
      case 'prefab': {
        const def = prefabById(ed.prefab);
        if (!def || !inside(c)) return;
        const placed = rotatePrefab(def, ed.prefabTurns);
        const at = fitPrefab(placed, w, h, c.x, c.y);
        if (!at) return useBoard.getState().showNotice(`La sala (${placed.w} × ${placed.h}) no cabe en la escena: agrándala en Ajustes de la escena.`);
        void placePrefab(scene!, placed, at.x, at.y, def.outdoor);
      }
    }
  }

  function onMove(p: Point) {
    setHover((old) => (old && Math.floor(old.x / (g / 4)) === Math.floor(p.x / (g / 4)) && Math.floor(old.y / (g / 4)) === Math.floor(p.y / (g / 4)) ? old : p));
    const c = cellOf(p);
    const ed = useMapEditor.getState();
    if (ed.draft !== null && last.current && (c.x !== last.current.x || c.y !== last.current.y)) {
      let t = ed.draft;
      for (const k of lineCells(last.current, c)) t = paintBrush(t, w, h, k.x, k.y, ed.brush, paintCode());
      last.current = c;
      ed.setDraft(t);
    }
    if (rect && (c.x !== rect.b.x || c.y !== rect.b.y)) setRect({ ...rect, b: c });
  }

  function onUp() {
    const ed = useMapEditor.getState();
    if (ed.draft !== null) {
      const t = ed.draft;
      last.current = null;
      void commitTerrain(scene!, t);
      ed.setDraft(null);
      return;
    }
    if (rect) {
      setRect(null);
      remember(scene!);
      if (ed.mode === 'room') {
        // Habitación: suelo (nunca un muro) y paredes alrededor siempre.
        const floor = isSolidCell(ed.code) ? 'p' : ed.code;
        void commitTerrain(scene!, paintRect(current(), w, h, rect.a.x, rect.a.y, rect.b.x, rect.b.y, floor), { force: true });
      } else void commitTerrain(scene!, paintRect(current(), w, h, rect.a.x, rect.a.y, rect.b.x, rect.b.y, ed.code));
    }
  }

  // ---------- Vista previa ----------
  const sw = 2 / scale;
  let overlay = null;
  if (rect) {
    const x = Math.min(rect.a.x, rect.b.x) * g;
    const y = Math.min(rect.a.y, rect.b.y) * g;
    const rw = (Math.abs(rect.b.x - rect.a.x) + 1) * g;
    const rh = (Math.abs(rect.b.y - rect.a.y) + 1) * g;
    const room = mode === 'room';
    overlay = (
      <>
        <Rect x={x} y={y} width={rw} height={rh} fill={terrainById(code)?.color ?? '#888'} opacity={0.45} stroke={room ? '#e8b25a' : '#fff'} strokeWidth={(room ? 5 : 2) / scale} listening={false} />
        <Text x={x} y={y - 20 / scale} text={`${rw / g} × ${rh / g}`} fontSize={14 / scale} fill="#fff" shadowColor="#000" shadowBlur={3} listening={false} />
      </>
    );
  } else if (hover && draft === null) {
    const c = cellOf(hover);
    if (mode === 'door') {
      const e = nearestCellEdge(hover.x, hover.y, g);
      overlay = <Line points={[e.x1, e.y1, e.x2, e.y2]} stroke="#5fb3e8" strokeWidth={6 / scale} lineCap="round" opacity={0.85} listening={false} />;
    } else if (mode === 'brush' || mode === 'erase') {
      const r0 = Math.floor((brush - 1) / 2);
      overlay = <Rect x={(c.x - r0) * g} y={(c.y - r0) * g} width={brush * g} height={brush * g} stroke={mode === 'erase' ? '#ff6b6b' : '#fff'} strokeWidth={sw} dash={[6 / scale, 4 / scale]} listening={false} />;
    } else if (mode === 'prefab') {
      overlay = prefabPreview(scene, c, prefabId, prefabTurns, scale);
    } else if (mode === 'stamp') {
      const s = stampSize * g;
      overlay = <Text x={c.x * g} y={c.y * g} width={s} height={s} text={stamp} fontSize={s * 0.8} align="center" verticalAlign="middle" opacity={0.5} listening={false} />;
    } else if (inside(c)) overlay = <Rect x={c.x * g} y={c.y * g} width={g} height={g} stroke="#fff" strokeWidth={sw} listening={false} />;
  }

  return { onDown, onMove, onUp, onLeave: () => setHover(null), overlay };
}

/** Vista previa de la sala prediseñada donde quedaría al hacer clic. */
function prefabPreview(scene: Scene, c: { x: number; y: number }, prefabId: string, turns: number, scale: number) {
  const def = prefabById(prefabId);
  if (!def) return null;
  const { widthCells: w, heightCells: h, gridSize: g } = scene;
  const p = rotatePrefab(def, turns);
  const at = fitPrefab(p, w, h, c.x, c.y);
  if (!at) {
    return (
      <Text x={c.x * g} y={c.y * g} text={`No cabe (${p.w} × ${p.h})`} fontSize={16 / scale} fill="#ff6b6b" shadowColor="#000" shadowBlur={3} listening={false} />
    );
  }
  const cells = p.rows.flatMap((row, y) =>
    row.split('').flatMap((code, x) =>
      code === TERRAIN_EMPTY ? [] : [<Rect key={`c${x}-${y}`} x={(at.x + x) * g} y={(at.y + y) * g} width={g} height={g} fill={terrainById(code)?.color ?? '#888'} opacity={0.55} listening={false} />],
    ),
  );
  return (
    <>
      {cells}
      <Rect x={at.x * g} y={at.y * g} width={p.w * g} height={p.h * g} stroke="#e8b25a" strokeWidth={3 / scale} dash={[8 / scale, 5 / scale]} listening={false} />
      {p.doors.map((d, i) => (
        <Line key={`d${i}`} points={[(at.x + d.x1) * g, (at.y + d.y1) * g, (at.x + d.x2) * g, (at.y + d.y2) * g]} stroke="#5fb3e8" strokeWidth={6 / scale} lineCap="round" listening={false} />
      ))}
      {p.objects.map((o, i) => (
        <Text
          key={`o${i}`}
          x={(at.x + o.x) * g}
          y={(at.y + o.y) * g}
          width={o.size * g}
          height={o.size * g}
          text={o.emoji}
          fontSize={o.size * g * 0.7}
          align="center"
          verticalAlign="middle"
          opacity={0.8}
          listening={false}
        />
      ))}
      <Text x={at.x * g} y={at.y * g - 22 / scale} text={`${def.name} · ${p.w} × ${p.h}`} fontSize={14 / scale} fill="#fff" shadowColor="#000" shadowBlur={3} listening={false} />
    </>
  );
}
