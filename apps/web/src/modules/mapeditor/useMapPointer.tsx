import { useRef, useState } from 'react';
import { Line, Rect, Text } from 'react-konva';
import {
  cellsOf,
  fitPrefab,
  floodFill,
  isSolidCell,
  nearestCellEdge,
  newScatterStroke,
  normalizeTerrain,
  paintBrush,
  paintRect,
  prefabById,
  rotatePrefab,
  scatterStep,
  terrainById,
  TERRAIN_EMPTY,
  type BoardItem,
  type Point,
  type ScatterStroke,
  type Scene,
} from '@vtt/shared';
import { useBoard } from '../board/store';
import { commitTerrain, placeItems, placePrefab, remember, removeItems, toggleDoorAt, useMapEditor } from './store';
import { tr } from '../../core/i18n';

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

/** Objetos (sellos) de la capa Mapa: los que puede tapar o borrar el pincel de objetos. */
const isMapStamp = (i: BoardItem) => i.layer === 'map' && i.drawing?.type === 'stamp';

/** Casillas que tapa un elemento. */
function itemCells(i: BoardItem, g: number): string[] {
  const out: string[] = [];
  for (let y = Math.floor(i.y / g + 0.01); y < Math.ceil((i.y + i.height) / g - 0.01); y++)
    for (let x = Math.floor(i.x / g + 0.01); x < Math.ceil((i.x + i.width) / g - 0.01); x++) out.push(`${x},${y}`);
  return out;
}

/** Trazo del pincel de objetos: los que van saliendo (poner) o los que se van a quitar (con Mayúsculas). */
type ScatterDraft = { erase: false; stroke: ScatterStroke; placed: { emoji: string; x: number; y: number }[] } | { erase: true; ids: Set<string> };

/** Ratón del editor de mapas sobre el tablero: pintar, rectángulos, cubo, puertas y objetos, con su vista previa. */
export function useMapPointer(scene: Scene | null, scale: number) {
  const [hover, setHover] = useState<Point | null>(null);
  const [rect, setRect] = useState<{ a: Cell; b: Cell } | null>(null);
  const [scatter, setScatter] = useState<ScatterDraft | null>(null);
  const last = useRef<Cell | null>(null);
  const draft = useMapEditor((s) => s.draft);
  const mode = useMapEditor((s) => s.mode);
  const brush = useMapEditor((s) => s.brush);
  const code = useMapEditor((s) => s.code);
  const stampSize = useMapEditor((s) => s.stampSize);
  const stamp = useMapEditor((s) => s.stamp);
  const stampScatter = useMapEditor((s) => s.stampScatter);
  const prefabId = useMapEditor((s) => s.prefab);
  const prefabTurns = useMapEditor((s) => s.prefabTurns);

  if (!scene) return { onDown: () => {}, onMove: () => {}, onUp: () => {}, onLeave: () => {}, overlay: null };
  const { widthCells: w, heightCells: h, gridSize: g } = scene;
  const cellOf = (p: Point): Cell => ({ x: Math.floor(p.x / g), y: Math.floor(p.y / g) });
  const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < w && c.y < h;
  const current = () => normalizeTerrain(useBoard.getState().scene?.terrain ?? '', w, h);
  const paintCode = () => (useMapEditor.getState().mode === 'erase' ? TERRAIN_EMPTY : useMapEditor.getState().code);

  /** Un paso del pincel de objetos en la casilla `c` (devuelve el trazo con lo nuevo). */
  function scatterAt(d: ScatterDraft, c: Cell): ScatterDraft {
    const ed = useMapEditor.getState();
    const r0 = Math.floor((ed.brush - 1) / 2);
    if (d.erase) {
      const zone = new Set(cellsOf(c.x - r0, c.y - r0, ed.brush));
      const ids = new Set(d.ids);
      for (const i of Object.values(useBoard.getState().items)) if (isMapStamp(i) && itemCells(i, g).some((k) => zone.has(k))) ids.add(i.id);
      return { erase: true, ids };
    }
    // Con suelo pintado, solo sobre suelo (no en muros ni en el vacío).
    const terrain = current();
    const painted = /[^.]/.test(terrain);
    const size = ed.stampSize;
    const allowed = (x: number, y: number) =>
      x >= 0 && y >= 0 && x + size <= w && y + size <= h && (!painted || cellsOf(x, y, size).every((k) => {
        const [cx, cy] = k.split(',').map(Number);
        return !isSolidCell(terrain[cy! * w + cx!]);
      }));
    const more = scatterStep(d.stroke, { x: c.x, y: c.y, brush: ed.brush, size, density: ed.scatterDensity, emojis: ed.stampMix, allowed, rnd: Math.random });
    return more.length ? { ...d, placed: [...d.placed, ...more] } : d;
  }

  function onDown(p: Point, mods: { shift?: boolean } = {}) {
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
        if (ed.stampScatter) {
          last.current = c;
          if (mods.shift) return setScatter(scatterAt({ erase: true, ids: new Set() }, c));
          const occupied = Object.values(useBoard.getState().items).filter(isMapStamp).flatMap((i) => itemCells(i, g));
          return setScatter(scatterAt({ erase: false, stroke: newScatterStroke(occupied), placed: [] }, c));
        }
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
        if (!at) return useBoard.getState().showNotice(tr('La sala ({w} × {h}) no cabe en la escena: agrándala en Ajustes de la escena.', { w: placed.w, h: placed.h }));
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
    if (scatter && last.current && (c.x !== last.current.x || c.y !== last.current.y)) {
      let d = scatter;
      for (const k of lineCells(last.current, c)) d = scatterAt(d, k);
      last.current = c;
      setScatter(d);
    }
  }

  function onUp() {
    const ed = useMapEditor.getState();
    if (scatter) {
      setScatter(null);
      last.current = null;
      if (scatter.erase) {
        const items = useBoard.getState().items;
        const gone = [...scatter.ids].map((id) => items[id]).filter((i): i is BoardItem => !!i);
        if (gone.length) void removeItems(scene!, gone);
      } else if (scatter.placed.length) {
        const s = ed.stampSize * g;
        void placeItems(
          scene!,
          scatter.placed.map((o) => ({ layer: 'map', x: o.x * g, y: o.y * g, width: s, height: s, drawing: { type: 'stamp', text: o.emoji } })),
        );
      }
      return;
    }
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
  if (scatter) {
    const s = stampSize * g;
    const items = useBoard.getState().items;
    overlay = (
      <>
        {scatter.erase
          ? [...scatter.ids].map((id) => {
              const i = items[id];
              return i ? <Rect key={id} x={i.x} y={i.y} width={i.width} height={i.height} fill="#ff6b6b" opacity={0.35} stroke="#ff6b6b" strokeWidth={sw} listening={false} /> : null;
            })
          : scatter.placed.map((o, n) => (
              <Text key={n} x={o.x * g} y={o.y * g} width={s} height={s} text={o.emoji} fontSize={s * 0.8} align="center" verticalAlign="middle" opacity={0.75} listening={false} />
            ))}
        {hover && brushOutline(cellOf(hover), brush, g, sw, scatter.erase ? '#ff6b6b' : '#7fd17f', scale)}
      </>
    );
  } else if (rect) {
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
    } else if (mode === 'stamp' && stampScatter) {
      overlay = brushOutline(c, brush, g, sw, '#7fd17f', scale);
    } else if (mode === 'stamp') {
      const s = stampSize * g;
      overlay = <Text x={c.x * g} y={c.y * g} width={s} height={s} text={stamp} fontSize={s * 0.8} align="center" verticalAlign="middle" opacity={0.5} listening={false} />;
    } else if (inside(c)) overlay = <Rect x={c.x * g} y={c.y * g} width={g} height={g} stroke="#fff" strokeWidth={sw} listening={false} />;
  }

  return { onDown, onMove, onUp, onLeave: () => setHover(null), overlay };
}

/** Contorno del pincel (cuadrado de `brush` casillas centrado en la casilla). */
function brushOutline(c: Cell, brush: number, g: number, sw: number, color: string, scale: number) {
  const r0 = Math.floor((brush - 1) / 2);
  return <Rect x={(c.x - r0) * g} y={(c.y - r0) * g} width={brush * g} height={brush * g} stroke={color} strokeWidth={sw} dash={[6 / scale, 4 / scale]} listening={false} />;
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
      <Text x={c.x * g} y={c.y * g} text={tr('No cabe ({w} × {h})', { w: p.w, h: p.h })} fontSize={16 / scale} fill="#ff6b6b" shadowColor="#000" shadowBlur={3} listening={false} />
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
