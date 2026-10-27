import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';
import { acViewOf, assetUrl, combatOf, createResolver, hpViewOf, statusesOf, type BoardItem, type BoardLayer, type Fog, type Measure, type Point, type Scene } from '@vtt/shared';
import { useSheets } from '../sheets/store';
import { addCharacterToken } from '../sheets/tokens';
import { useActiveItemId } from '../initiative/store';
import { emitAck, getSocket } from '../../core/socket';
import { clearMeasure, fixedTemplateEnd, sendPing, setMeasure, snapPoint, snapTemplateEnd } from './measure';
import { MeasuresLayer } from './Measures';
import { WallArt } from './WallArt';
import { addTurn, listenTurns } from './waypoints';
import { FxLayer } from '../fx/FxLayer';
import { DrawingShape, fillOf, textBox } from './Drawing';
import { useBoard } from './store';
import { createItem, deleteItem, redo, undo, updateItem } from './history';
import { DoorButtons, newWallId, saveWalls, snapWallPoint, useEyes, useLights, VisionMask, WallLines } from './Walls';
import { MapEditorPanel } from '../mapeditor/MapEditorPanel';
import { TerrainLayer } from '../mapeditor/TerrainLayer';
import { useMapEditor } from '../mapeditor/store';
import { useMapPointer } from '../mapeditor/useMapPointer';
import { GridCalOverlay, GridCalPanel } from '../gridcal/GridCalPanel';
import { stopCalibration, useGridCal } from '../gridcal/store';
import { tr } from '../../core/i18n';

interface Props {
  isGm: boolean;
  meId: string;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const MOVE_THROTTLE_MS = 40;

export function Board({ isGm, meId }: Props) {
  const scene = useBoard((s) => s.scene);
  const itemsById = useBoard((s) => s.items);
  const moving = useBoard((s) => s.moving);
  const selectedId = useBoard((s) => s.selectedId);
  const targets = useBoard((s) => s.targets);
  const tool = useBoard((s) => s.tool);
  const activeLayer = useBoard((s) => s.activeLayer);
  const select = useBoard((s) => s.select);
  const activeItemId = useActiveItemId();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [fogDraft, setFogDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Rectángulo que se marca al calibrar la cuadrícula de una imagen. */
  const [calDraft, setCalDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Dibujo en curso (coordenadas de escena). */
  const [drawDraft, setDrawDraft] = useState<number[] | null>(null);
  /** Midiendo ahora mismo (botón pulsado). */
  const measuring = useRef(false);
  /** Distancia que recorre el token que estoy arrastrando (solo la veo yo). */
  const [dragMeasure, setDragMeasure] = useState<Measure | null>(null);
  const focus = useBoard((s) => s.focus);
  /** Pared que se está trazando. */
  const [wallDraft, setWallDraft] = useState<{ a: Point; b: Point } | null>(null);
  const previewVision = useBoard((s) => s.previewVision);
  const notice = useBoard((s) => s.notice);
  /** Desplazar la vista con el botón central o derecho (en las herramientas que usan el izquierdo). */
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const terrainDraft = useMapEditor((s) => s.draft);
  const mapPointer = useMapPointer(scene, view.scale);
  const mapPointerRef = useRef(mapPointer);
  mapPointerRef.current = mapPointer;
  const mapTool = isGm && tool === 'map';

  // Al soltar el ratón (aunque sea fuera del tablero) se guarda lo pintado.
  useEffect(() => {
    const up = () => {
      pan.current = null;
      if (mapTool) mapPointerRef.current.onUp();
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [mapTool]);

  // Tamaño del lienzo = tamaño del contenedor.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Al abrir una escena, encuadrarla.
  const fittedScene = useRef<string | null>(null);
  useEffect(() => {
    if (!scene || !size.width || fittedScene.current === scene.id) return;
    fittedScene.current = scene.id;
    const w = scene.widthCells * scene.gridSize;
    const h = scene.heightCells * scene.gridSize;
    const scale = Math.min(size.width / w, size.height / h, 1) * 0.95;
    setView({ scale, x: (size.width - w * scale) / 2, y: (size.height - h * scale) / 2 });
  }, [scene, size]);

  // El DM ha pedido centrar la vista de todos en un punto.
  useEffect(() => {
    if (!focus || !size.width) return;
    setView((v) => ({ ...v, x: size.width / 2 - focus.x * v.scale, y: size.height / 2 - focus.y * v.scale }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Al dejar la herramienta de medir, mi medición desaparece.
  useEffect(() => {
    if (tool !== 'measure') clearMeasure(isGm);
  }, [tool, isGm]);

  useEffect(() => {
    if (size.width) useBoard.getState().setViewCenter({ x: (size.width / 2 - view.x) / view.scale, y: (size.height / 2 - view.y) / view.scale });
  }, [view, size]);

  // Suprimir / Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const { selectedId, scene, items } = useBoard.getState();
      // Deshacer / rehacer (en el editor de mapas, el suyo).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && useBoard.getState().tool !== 'map') {
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'y') {
          e.preventDefault();
          if (k === 'y' || e.shiftKey) void redo();
          else void undo();
          return;
        }
      }
      if (e.key === 'Escape') {
        if (useBoard.getState().tool === 'calibrate') return stopCalibration();
        select(null);
        useBoard.getState().clearTargets();
        clearMeasure(isGm);
      }
      // Espacio mientras se mide o se arrastra un token: punto de giro (igual que el clic derecho).
      if (e.key === ' ' && addTurn()) e.preventDefault();
      const sel = selectedId ? items[selectedId] : undefined;
      const canDelete = isGm || (sel?.drawing && sel.ownerIds.includes(meId));
      if (canDelete && selectedId && scene && (e.key === 'Delete' || e.key === 'Backspace')) {
        void deleteItem(scene.id, selectedId).catch((err: Error) => useBoard.getState().showNotice(err.message));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGm, meId, select]);

  const items = useMemo(() => {
    const list = Object.values(itemsById).map((i) => (moving[i.id] ? { ...i, ...moving[i.id] } : i));
    return list.sort((a, b) => a.z - b.z);
  }, [itemsById, moving]);
  const byLayer = (layer: BoardLayer) => items.filter((i) => i.layer === layer);
  const eyes = useEyes(scene, itemsById, meId, isGm, previewVision);
  const lights = useLights(scene, itemsById, isGm);

  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage()!;
    const pointer = stage.getPointerPosition()!;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (e.evt.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const wx = (pointer.x - v.x) / v.scale;
      const wy = (pointer.y - v.y) / v.scale;
      return { scale, x: pointer.x - wx * scale, y: pointer.y - wy * scale };
    });
  }, []);

  if (!scene) return <div ref={containerRef} className="board-container" />;

  const sceneW = scene.widthCells * scene.gridSize;
  const sceneH = scene.heightCells * scene.gridSize;
  const fogTool = isGm && tool.startsWith('fog-') && scene.fog.enabled;
  const measureTool = tool === 'measure';
  const pingTool = tool === 'ping';
  const drawTool = tool === 'draw';
  const wallTool = isGm && tool === 'walls';
  const calTool = isGm && tool === 'calibrate';
  const freeTool = !fogTool && !measureTool && !pingTool && !drawTool && !wallTool && !mapTool && !calTool;
  const terrain = terrainDraft ?? scene.terrain;

  function pointerInScene(stage: Konva.Stage) {
    return stage.getRelativePointerPosition()!;
  }

  function measurePoint(stage: Konva.Stage, evt: MouseEvent | TouchEvent, shape: Measure['shape']): Point {
    const free = 'altKey' in evt && evt.altKey;
    return snapPoint(pointerInScene(stage), scene!.gridSize, free ? 'free' : shape === 'ruler' ? 'center' : 'half');
  }

  function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage()!;
    if (!freeTool && 'button' in e.evt && e.evt.button !== 0) {
      pan.current = { sx: e.evt.clientX, sy: e.evt.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (calTool) {
      const p = pointerInScene(stage);
      setCalDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    if (mapTool) {
      mapPointer.onDown(pointerInScene(stage), { shift: 'shiftKey' in e.evt && e.evt.shiftKey });
      return;
    }
    if (measureTool) {
      const { measureShape: shape, templatePreset } = useBoard.getState();
      const p = measurePoint(stage, e.evt, shape);
      measuring.current = true;
      // Con la regla, clic derecho (o espacio) sin soltar: punto intermedio para cambiar de dirección.
      if (shape === 'ruler') listenTurns(addRulerTurn);
      // Plantilla de un hechizo: sale ya con su tamaño; al arrastrar solo cambia la dirección.
      const fixed = templatePreset?.shape === shape ? templatePreset.cells * scene!.gridSize : 0;
      setMeasure({ shape, points: [p, fixed ? fixedTemplateEnd(p, pointerInScene(stage), fixed, shape) : p] }, isGm, { now: true });
      return;
    }
    if (pingTool) {
      sendPing(pointerInScene(stage), isGm && e.evt.shiftKey);
      return;
    }
    if (drawTool) {
      const p = pointerInScene(stage);
      const { draw } = useBoard.getState();
      if (draw.type === 'text') {
        const text = prompt(tr('Texto'));
        if (text?.trim()) void createDrawing([p.x, p.y], text.trim());
        return;
      }
      setDrawDraft([p.x, p.y, p.x, p.y]);
      return;
    }
    if (wallTool) {
      if (useBoard.getState().wallMode === 'erase') return;
      const p = snapWallPoint(pointerInScene(stage), scene!, view.scale, 'altKey' in e.evt && e.evt.altKey);
      setWallDraft({ a: p, b: p });
      return;
    }
    if (fogTool) {
      const p = pointerInScene(stage);
      setFogDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    // Clic en zona vacía: deseleccionar.
    if (e.target === stage || e.target.name() === 'background') select(null);
  }

  function addRulerTurn() {
    const mine = useBoard.getState().myMeasure;
    if (mine?.shape !== 'ruler' || mine.points.length >= 32) return;
    setMeasure({ ...mine, points: [...mine.points, mine.points[mine.points.length - 1]!] }, isGm);
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const p0 = pan.current;
    if (p0 && 'clientX' in e.evt) {
      const evt = e.evt;
      setView((v) => ({ ...v, x: p0.vx + evt.clientX - p0.sx, y: p0.vy + evt.clientY - p0.sy }));
      return;
    }
    if (mapTool) {
      mapPointer.onMove(pointerInScene(e.target.getStage()!));
      return;
    }
    const mine = useBoard.getState().myMeasure;
    if (measuring.current && mine) {
      const stage = e.target.getStage()!;
      const free = 'altKey' in e.evt && e.evt.altKey;
      const preset = useBoard.getState().templatePreset;
      const p =
        preset?.shape === mine.shape
          ? fixedTemplateEnd(mine.points[0]!, pointerInScene(stage), preset.cells * scene!.gridSize, mine.shape)
          : mine.shape === 'ruler' || free
            ? measurePoint(stage, e.evt, mine.shape)
            : snapTemplateEnd(mine.points[0]!, pointerInScene(stage), scene!.gridSize, mine.shape);
      const last = mine.points[mine.points.length - 1]!;
      if (p.x !== last.x || p.y !== last.y) setMeasure({ ...mine, points: [...mine.points.slice(0, -1), p] }, isGm);
      return;
    }
    if (drawDraft) {
      const p = pointerInScene(e.target.getStage()!);
      if (useBoard.getState().draw.type === 'path') {
        // Mano alzada: se añade un punto cuando el ratón se ha movido algo (en píxeles de pantalla).
        const [lx, ly] = drawDraft.slice(-2) as [number, number];
        if (Math.hypot(p.x - lx, p.y - ly) * view.scale >= 4 && drawDraft.length < 3990) setDrawDraft([...drawDraft, p.x, p.y]);
      } else setDrawDraft([drawDraft[0]!, drawDraft[1]!, p.x, p.y]);
      return;
    }
    if (wallDraft) {
      const b = snapWallPoint(pointerInScene(e.target.getStage()!), scene!, view.scale, 'altKey' in e.evt && e.evt.altKey);
      if (b.x !== wallDraft.b.x || b.y !== wallDraft.b.y) setWallDraft({ ...wallDraft, b });
      return;
    }
    if (calDraft) {
      const p = pointerInScene(e.target.getStage()!);
      setCalDraft({ ...calDraft, x1: p.x, y1: p.y });
      return;
    }
    if (!fogDraft) return;
    const p = pointerInScene(e.target.getStage()!);
    setFogDraft({ ...fogDraft, x1: p.x, y1: p.y });
  }

  function onStageMouseUp() {
    if (calDraft) {
      const r = normRect(calDraft);
      setCalDraft(null);
      if (r.w * view.scale >= 6 && r.h * view.scale >= 6) useGridCal.getState().set({ marked: { x: r.x, y: r.y, width: r.w, height: r.h } });
      return;
    }
    if (wallDraft) {
      const { a, b } = wallDraft;
      setWallDraft(null);
      const kind = useBoard.getState().wallMode;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 4 || kind === 'erase') return;
      void saveWalls(scene!, [...scene!.walls, { id: newWallId(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind, open: false, locked: false }]).catch((e: Error) =>
        useBoard.getState().showNotice(e.message),
      );
      return;
    }
    if (drawDraft) {
      const pts = drawDraft;
      setDrawDraft(null);
      void createDrawing(pts);
      return;
    }
    if (measuring.current) {
      // La medición se queda a la vista hasta pulsar Esc, empezar otra o cambiar de herramienta.
      measuring.current = false;
      listenTurns(null);
      const mine = useBoard.getState().myMeasure;
      const [a, b] = [mine?.points[0], mine?.points[mine.points.length - 1]];
      if (a && b && a.x === b.x && a.y === b.y && mine!.points.length === 2) clearMeasure(isGm);
      else setMeasure(mine, isGm, { now: true });
      return;
    }
    if (!fogDraft || !scene) return;
    const rect = normRect(fogDraft);
    setFogDraft(null);
    if (rect.w < 4 || rect.h < 4) return;
    void emitAck('fog:add', { sceneId: scene.id, op: { mode: tool === 'fog-hide' ? 'hide' : 'reveal', ...rect } });
  }

  /** Crea el dibujo: su caja es la de los puntos, y los puntos quedan relativos a ella. */
  function createDrawing(abs: number[], text?: string) {
    const { draw, activeLayer } = useBoard.getState();
    const layer = isGm ? activeLayer : 'token';
    if (text !== undefined) {
      const fontSize = Math.round(scene!.gridSize * 0.4);
      const box = textBox(text, fontSize);
      return createItem(scene!.id, { layer, x: abs[0]!, y: abs[1]!, ...{ width: box.width, height: box.height }, drawing: { type: 'text', text, fontSize, stroke: draw.stroke } });
    }
    const xs = abs.filter((_, i) => i % 2 === 0);
    const ys = abs.filter((_, i) => i % 2 === 1);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width * view.scale < 3 && height * view.scale < 3) return; // un clic sin arrastrar
    const pad = draw.strokeWidth / 2;
    const points = abs.map((v, i) => v - (i % 2 === 0 ? x : y) + pad);
    return createItem(scene!.id, {
      layer,
      x: x - pad,
      y: y - pad,
      width: Math.max(1, width + pad * 2),
      height: Math.max(1, height + pad * 2),
      drawing: {
        type: draw.type,
        points: draw.type === 'path' || draw.type === 'line' ? points : [],
        stroke: draw.stroke,
        strokeWidth: draw.strokeWidth,
        fill: draw.filled ? fillOf(draw.stroke) : '',
      },
    });
  }

  const itemProps = (item: BoardItem) => ({
    item,
    isGm,
    scene,
    selected: item.id === selectedId,
    interactive: freeTool && (isGm ? item.layer === activeLayer : item.layer === 'token' && item.ownerIds.includes(meId)),
    ghost: item.layer === 'gm',
    transformable: isGm || (!!item.drawing && item.ownerIds.includes(meId)),
    turn: item.id === activeItemId,
    onSelect: () => select(item.id),
    onDragPath: setDragMeasure,
    // Objetivos: Alt+clic en cualquier token, o clic en uno que no puedes mover.
    canTarget: freeTool && !item.drawing && item.layer !== 'map',
    targeted: targets.includes(item.id),
  });

  return (
    <div
      ref={containerRef}
      className={`board-container ${freeTool ? '' : 'crosshair'}`}
      onContextMenu={(e) => !freeTool && e.preventDefault()}
      onDragOver={(e) => isGm && e.dataTransfer.types.includes('application/x-vtt-character') && e.preventDefault()}
      onDrop={(e) => {
        // Soltar un personaje de la lista sobre el tablero crea su token ahí.
        const id = e.dataTransfer.getData('application/x-vtt-character');
        const character = useSheets.getState().characters[id];
        const stage = stageRef.current;
        if (!isGm || !character || !stage) return;
        e.preventDefault();
        stage.setPointersPositions(e);
        const p = stage.getRelativePointerPosition()!;
        useBoard.getState().setViewCenter(p);
        void addCharacterToken(character);
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={freeTool}
        onDragEnd={(e) => e.target === e.target.getStage() && setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))}
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onTouchStart={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onTouchMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onTouchEnd={onStageMouseUp}
        onMouseLeave={mapPointer.onLeave}
        onDblClick={(e) => {
          // Doble clic en el fondo: ping (con Mayús, el DM centra la vista de todos).
          if (freeTool && (e.target === e.target.getStage() || e.target.name() === 'background')) sendPing(pointerInScene(e.target.getStage()!), isGm && e.evt.shiftKey);
        }}
      >
        <Layer>
          <Rect name="background" width={sceneW} height={sceneH} fill={scene.backgroundColor} />
          {terrain && <TerrainLayer scene={scene} terrain={terrain} />}
          {byLayer('map').map((i) => (
            <ItemNode key={i.id} {...itemProps(i)} />
          ))}
          {scene.gridVisible && <Grid scene={scene} />}
          <WallArt walls={scene.walls} gridSize={scene.gridSize} isGm={isGm} />
        </Layer>
        <Layer>
          {byLayer('token').map((i) => (
            <ItemNode key={i.id} {...itemProps(i)} />
          ))}
        </Layer>
        {eyes && (
          <Layer listening={false} opacity={isGm ? 0.7 : 1}>
            <VisionMask scene={scene} eyes={eyes} lights={lights} />
          </Layer>
        )}
        {!eyes && lights && (
          // El DM ve por dónde llega la luz, con la oscuridad suavizada.
          <Layer listening={false} opacity={0.45}>
            <VisionMask scene={scene} eyes={null} lights={lights} />
          </Layer>
        )}
        <Layer listening={false} opacity={isGm ? 0.45 : 1}>
          {scene.fog.enabled && <FogShape fog={scene.fog} width={sceneW} height={sceneH} />}
        </Layer>
        <Layer>
          {isGm && byLayer('gm').map((i) => <ItemNode key={i.id} {...itemProps(i)} />)}
          {isGm && wallTool && <WallLines scene={scene} scale={view.scale} editing={wallTool} />}
          {wallDraft && (
            <Line
              points={[wallDraft.a.x, wallDraft.a.y, wallDraft.b.x, wallDraft.b.y]}
              stroke="#fff"
              strokeWidth={4 / view.scale}
              dash={[8 / view.scale, 6 / view.scale]}
              listening={false}
            />
          )}
          <DoorButtons scene={scene} scale={view.scale} isGm={isGm} eyes={eyes} />
          {fogDraft && (
            <Rect
              {...rectProps(normRect(fogDraft))}
              stroke={tool === 'fog-hide' ? '#000' : '#fff'}
              dash={[10, 6]}
              strokeWidth={2 / view.scale}
              fill={tool === 'fog-hide' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.15)'}
              listening={false}
            />
          )}
          {drawDraft && <DraftShape pts={drawDraft} />}
          {mapTool && mapPointer.overlay}
          {calTool && <GridCalOverlay draft={calDraft ? rectProps(normRect(calDraft)) : null} scale={view.scale} />}
          <MeasuresLayer scene={scene} scale={view.scale} dragMeasure={dragMeasure} />
        </Layer>
        <FxLayer scene={scene} scale={view.scale} />
      </Stage>
      {eyes && !eyes.length && !isGm && <div className="board-notice">{tr('Visión activada: no tienes ningún token en esta escena, así que no ves nada.')}</div>}
      {notice && <div className="board-notice">{notice}</div>}
      {mapTool && <MapEditorPanel scene={scene} />}
      {calTool && <GridCalPanel scene={scene} />}
    </div>
  );
}

/** Vista previa del dibujo mientras se arrastra. */
function DraftShape({ pts }: { pts: number[] }) {
  const draw = useBoard((s) => s.draw);
  const [x0, y0] = [pts[0]!, pts[1]!];
  const [x1, y1] = pts.slice(-2) as [number, number];
  const box = { width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
  const drawing = { type: draw.type, points: draw.type === 'path' || draw.type === 'line' ? pts : [], stroke: draw.stroke, strokeWidth: draw.strokeWidth, fill: draw.filled ? fillOf(draw.stroke) : '', text: '', fontSize: 0 };
  return (
    <Group x={draw.type === 'path' || draw.type === 'line' ? 0 : Math.min(x0, x1)} y={draw.type === 'path' || draw.type === 'line' ? 0 : Math.min(y0, y1)} listening={false} opacity={0.8}>
      <DrawingShape drawing={drawing} {...box} />
    </Group>
  );
}

function normRect(d: { x0: number; y0: number; x1: number; y1: number }) {
  return { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
}
const rectProps = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, width: r.w, height: r.h });

function Grid({ scene }: { scene: Scene }) {
  const { gridSize: g, widthCells: cw, heightCells: ch, gridColor } = scene;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        for (let i = 0; i <= cw; i++) {
          ctx.moveTo(i * g, 0);
          ctx.lineTo(i * g, ch * g);
        }
        for (let j = 0; j <= ch; j++) {
          ctx.moveTo(0, j * g);
          ctx.lineTo(cw * g, j * g);
        }
        ctx.strokeShape(shape);
      }}
      stroke={gridColor}
      strokeWidth={1}
    />
  );
}

/** Niebla: negro total y luego, en orden, se "recortan" las zonas reveladas o se vuelven a tapar. */
function FogShape({ fog, width, height }: { fog: Fog; width: number; height: number }) {
  return (
    <Shape
      sceneFunc={(kctx) => {
        const ctx = kctx._context;
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillRect(0, 0, width, height);
        for (const op of fog.ops) {
          ctx.globalCompositeOperation = op.mode === 'reveal' ? 'destination-out' : 'source-over';
          ctx.fillRect(op.x, op.y, op.w, op.h);
        }
        ctx.restore();
      }}
    />
  );
}

interface ItemNodeProps {
  item: BoardItem;
  /** Quien mira es el DM (ve la vida aunque esté oculta para los jugadores, marcada). */
  isGm: boolean;
  scene: Scene;
  selected: boolean;
  interactive: boolean;
  ghost: boolean;
  transformable: boolean;
  /** Es su turno en la iniciativa. */
  turn: boolean;
  onSelect: () => void;
  /** Recorrido mientras se arrastra (null al soltar). */
  onDragPath: (m: Measure | null) => void;
  /** Se puede marcar como objetivo y si ya lo está. */
  canTarget: boolean;
  targeted: boolean;
}

function ItemNode({ item, isGm, scene, selected, interactive, ghost, transformable, turn, onSelect, onDragPath, canTarget, targeted }: ItemNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const lastEmit = useRef(0);
  /** Puntos de giro del arrastre en curso (clic derecho sin soltar el izquierdo) y última casilla bajo el puntero. */
  const turns = useRef<Point[]>([]);
  const lastTo = useRef<Point | null>(null);
  const character = useSheets((s) => (item.characterId ? s.characters[item.characterId] : undefined));
  const template = useSheets((s) => s.template);
  const imageId = item.assetId ?? character?.avatarAssetId ?? null;
  const [image] = useImage(imageId ? assetUrl(imageId) : '');
  const name = item.name || character?.name || '';
  // Barras extra de la plantilla (la de vida va aparte, con lo que diga el servidor que se puede ver).
  const bars = useMemo(() => {
    if (!character || !template) return [];
    const resolve = createResolver(template, character.values);
    const hpKey = combatOf(template)?.hp;
    return template.bars.filter((b) => !item.stats || b.value !== hpKey).map((b) => {
      const value = Number(resolve(b.value)) || 0;
      const max = b.max ? Number(resolve(b.max)) || 0 : 0;
      return { value, max, color: b.color };
    });
  }, [character, template, item.stats]);
  const statusIcons = useMemo(() => {
    if (!item.statuses.length) return [];
    const defs = statusesOf(template);
    return item.statuses.map((id) => defs.find((d) => d.id === id)).filter((d) => !!d);
  }, [item.statuses, template]);
  const isGmSelected = selected && interactive && transformable;

  useEffect(() => {
    if (isGmSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isGmSelected]);

  const { width: w, height: h } = item;
  const g = scene.gridSize;
  const snap = (v: number, free: boolean) => (free ? v : Math.round(v / g) * g);

  const origin = () => ({ x: item.x + w / 2, y: item.y + h / 2 });

  function onDragStart(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true;
    turns.current = [];
    lastTo.current = null;
    if (item.drawing) return;
    listenTurns(() => {
      const to = lastTo.current;
      const prev = turns.current[turns.current.length - 1] ?? origin();
      if (!to || turns.current.length >= 30 || (to.x === prev.x && to.y === prev.y)) return;
      turns.current = [...turns.current, to];
      onDragPath({ shape: 'ruler', points: [origin(), ...turns.current, to] });
    });
  }

  function onDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    const to = e.evt.altKey ? { x: e.target.x(), y: e.target.y() } : { x: snap(e.target.x() - w / 2, false) + w / 2, y: snap(e.target.y() - h / 2, false) + h / 2 };
    lastTo.current = to;
    if (!item.drawing) onDragPath({ shape: 'ruler', points: [origin(), ...turns.current, to] });
    const now = performance.now();
    if (now - lastEmit.current < MOVE_THROTTLE_MS) return;
    lastEmit.current = now;
    getSocket().emit('item:moving', { sceneId: scene.id, id: item.id, x: e.target.x() - w / 2, y: e.target.y() - h / 2 });
  }

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true;
    onDragPath(null);
    listenTurns(null);
    const path = turns.current;
    turns.current = [];
    // Los dibujos no se ajustan a la cuadrícula.
    const free = e.evt.altKey || !!item.drawing;
    const x = snap(e.target.x() - w / 2, free);
    const y = snap(e.target.y() - h / 2, free);
    e.target.position({ x: x + w / 2, y: y + h / 2 });
    void updateItem(scene.id, item.id, { x, y }, path).catch((err: Error) => {
      // Si el servidor lo rechaza (p. ej. hay una pared en medio), volver a la posición guardada.
      e.target.position({ x: item.x + w / 2, y: item.y + h / 2 });
      useBoard.getState().showNotice(err.message);
    });
  }

  function onTransformEnd() {
    const node = groupRef.current!;
    const sx = node.scaleX();
    const sy = node.scaleY();
    const nw = Math.max(5, w * sx);
    const nh = Math.max(5, h * sy);
    node.scale({ x: 1, y: 1 });
    // Los dibujos se reescalan de verdad (puntos y tamaño de letra), no solo su caja.
    const d = item.drawing;
    const drawing = d && {
      ...d,
      points: d.points.map((v, i) => v * (i % 2 === 0 ? nw / w : nh / h)),
      fontSize: d.type === 'text' ? Math.max(6, Math.min(400, d.fontSize * (nh / h))) : d.fontSize,
    };
    void updateItem(scene.id, item.id, { width: nw, height: nh, x: node.x() - nw / 2, y: node.y() - nh / 2, rotation: node.rotation(), ...(drawing ? { drawing } : {}) });
  }

  function toggleTarget() {
    useBoard.getState().toggleTarget(item.id);
    const label = name || tr('el token');
    useBoard.getState().showNotice(useBoard.getState().targets.includes(item.id) ? tr('🎯 Objetivo: {label} (Esc para quitar todos)', { label }) : tr('Ya no apuntas a {label}', { label }));
  }

  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <Group
        ref={groupRef}
        x={item.x + w / 2}
        y={item.y + h / 2}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={item.rotation}
        opacity={ghost ? 0.6 : 1}
        draggable={interactive}
        listening={interactive || canTarget}
        onMouseDown={(e) => {
          if (!interactive || (canTarget && e.evt.altKey)) return;
          e.cancelBubble = true;
          onSelect();
        }}
        onTouchStart={(e) => {
          if (!interactive) return;
          e.cancelBubble = true;
          onSelect();
        }}
        onClick={(e) => canTarget && (e.evt.altKey || !interactive) && toggleTarget()}
        onTap={() => canTarget && !interactive && toggleTarget()}
        onMouseEnter={(e) => {
          const c = e.target.getStage()?.container();
          if (c && canTarget && !interactive) c.style.cursor = 'crosshair';
        }}
        onMouseLeave={(e) => {
          const c = e.target.getStage()?.container();
          if (c) c.style.cursor = '';
        }}
        onDblClick={() => character && useSheets.getState().openSheet(character.id)}
        onDblTap={() => character && useSheets.getState().openSheet(character.id)}
        onDragStart={onDragStart}
        onDragMove={(e) => {
          e.cancelBubble = true;
          onDragMove(e);
        }}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {item.drawing ? (
          <>
            {/* Caja invisible para poder agarrar el dibujo por dentro. */}
            {item.drawing.type !== 'path' && item.drawing.type !== 'line' && <Rect width={w} height={h} fill="rgba(0,0,0,0.001)" />}
            <DrawingShape drawing={item.drawing} width={w} height={h} />
          </>
        ) : image ? (
          <KImage image={image} width={w} height={h} />
        ) : (
          <>
            <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 2 - 2} fill={item.color} stroke="#000" strokeWidth={2} />
            <Text text={initials} width={w} height={h} align="center" verticalAlign="middle" fontSize={Math.min(w, h) / 2.6} fill="#fff" fontStyle="bold" />
          </>
        )}
        {selected && !interactive && <Rect width={w} height={h} stroke="#d6a84a" strokeWidth={2} />}
        {turn && (
          <Circle x={w / 2} y={h / 2} radius={Math.max(w, h) / 2 + 6} stroke="#d6a84a" strokeWidth={4} dash={[10, 6]} shadowColor="#d6a84a" shadowBlur={12} listening={false} />
        )}
        {targeted && <TargetRing w={w} h={h} />}
        {item.stats && <StatsOverlay item={item} gm={isGm} />}
        {bars.map((b, i) => (
          <Group key={i} y={-8 - (i + (item.stats?.ratio !== undefined ? 1 : 0)) * 8} listening={false}>
            <Rect width={w} height={6} fill="rgba(0,0,0,0.6)" cornerRadius={3} />
            <Rect width={b.max > 0 ? w * Math.max(0, Math.min(1, b.value / b.max)) : w} height={6} fill={b.color} cornerRadius={3} />
            {b.max > 0 && b.value > b.max && <Rect width={w} height={6} stroke="#fff" strokeWidth={1} cornerRadius={3} />}
          </Group>
        ))}
        {statusIcons.map((d, i) => {
          // Iconos en fila sobre la esquina superior derecha; si no caben, siguen hacia abajo.
          const s = Math.max(18, Math.min(w, h) / 2.6);
          const perRow = Math.max(1, Math.floor(w / s));
          return (
            <Group key={d.id} x={w - s / 2 - (i % perRow) * s} y={s / 2 + Math.floor(i / perRow) * s} listening={false}>
              <Circle radius={s / 2} fill="rgba(20,18,26,0.8)" stroke={d.kind === 'buff' ? '#4cd964' : d.kind === 'debuff' ? '#ff5a4f' : '#d6a84a'} strokeWidth={d.kind ? 2 : 1} />
              <Text text={d.icon} fontSize={s * 0.62} width={s} height={s} offsetX={s / 2} offsetY={s / 2} align="center" verticalAlign="middle" />
              {item.statusRounds[d.id] ? (
                // Rondas que le quedan al estado.
                <Text text={String(item.statusRounds[d.id])} x={s * 0.08} y={s * 0.05} fontSize={s * 0.42} fontStyle="bold" fill="#fff" stroke="#000" strokeWidth={s * 0.06} fillAfterStrokeEnabled />
              ) : null}
            </Group>
          );
        })}
        {isGm && item.gmNotes && item.drawing?.type !== 'note' && item.drawing?.type !== 'zone' && (
          // Solo el DM: este token tiene notas privadas (se leen en el panel al seleccionarlo).
          <Text text="📝" x={-4} y={-4} fontSize={Math.max(14, Math.min(w, h) / 3.2)} listening={false} shadowColor="#000" shadowBlur={3} />
        )}
        {item.showName && name && (
          <Text
            text={name}
            y={h + 2}
            x={-w}
            width={w * 3}
            align="center"
            fontSize={Math.max(11, g / 5)}
            fill="#fff"
            shadowColor="#000"
            shadowBlur={3}
            shadowOpacity={1}
          />
        )}
      </Group>
      {isGmSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          borderStroke="#d6a84a"
          anchorStroke="#d6a84a"
          anchorFill="#201e26"
          anchorSize={9}
        />
      )}
    </>
  );
}

/** Mira roja alrededor de un token marcado como objetivo. */
function TargetRing({ w, h }: { w: number; h: number }) {
  const r = Math.max(w, h) / 2 + 4;
  const t = Math.max(6, r * 0.35);
  return (
    <Group x={w / 2} y={h / 2} listening={false}>
      <Circle radius={r} stroke="#ff4d4d" strokeWidth={3} shadowColor="#000" shadowBlur={4} />
      {[0, 90, 180, 270].map((a) => (
        <Line key={a} rotation={a} points={[r - t / 2, 0, r + t, 0]} stroke="#ff4d4d" strokeWidth={3} lineCap="round" />
      ))}
    </Group>
  );
}

/** Color de la barra según la vida que queda. */
const hpColor = (r: number) => (r > 0.5 ? '#3fa34d' : r > 0.25 ? '#e0a030' : '#c0392b');

/**
 * Vida (con los PG temporales en azul) y CA del token. El servidor ya ha quitado lo que no se puede ver;
 * el DM ve lo oculto para los jugadores más apagado y con un ojo tachado.
 */
function StatsOverlay({ item, gm }: { item: BoardItem; gm: boolean }) {
  const st = item.stats!;
  const { width: w, height: h } = item;
  const hiddenHp = gm && !item.ownerIds.length && hpViewOf(item) === 'gm';
  const hiddenAc = gm && !item.ownerIds.length && acViewOf(item) === 'gm';
  const label = st.hp != null ? `${st.hp}${st.hpMax ? `/${st.hpMax}` : ''}${st.hpTemp ? ` +${st.hpTemp}` : ''}` : '';
  const shield = Math.max(18, Math.min(w, h) / 2.8);
  return (
    <>
      {st.ratio !== undefined && (
        <Group y={-8} listening={false} opacity={hiddenHp ? 0.6 : 1}>
          <Rect width={w} height={6} fill="rgba(0,0,0,0.65)" cornerRadius={3} />
          <Rect width={w * st.ratio} height={6} fill={hpColor(st.ratio)} cornerRadius={3} />
          {!!st.tempRatio && (
            <Rect
              x={Math.min(w * st.ratio, w * (1 - st.tempRatio))}
              width={w * st.tempRatio}
              height={6}
              fill="#4aa3df"
              stroke="#bfe3ff"
              strokeWidth={0.5}
              cornerRadius={3}
            />
          )}
          {hiddenHp && <Rect width={w} height={6} stroke="#fff" strokeWidth={1} dash={[3, 2]} cornerRadius={3} />}
          {label && (
            <Text
              text={(hiddenHp ? '🙈 ' : '') + label}
              y={-13}
              width={w}
              align="center"
              fontSize={11}
              fontStyle="bold"
              fill="#fff"
              shadowColor="#000"
              shadowBlur={3}
              shadowOpacity={1}
            />
          )}
        </Group>
      )}
      {st.ac !== undefined && (
        <Group x={-shield * 0.25} y={h - shield * 0.85} listening={false} opacity={hiddenAc ? 0.6 : 1}>
          <Shape
            sceneFunc={(ctx, shape) => {
              const s = shield;
              ctx.beginPath();
              ctx.moveTo(s / 2, 0);
              ctx.lineTo(s, s * 0.14);
              ctx.quadraticCurveTo(s, s * 0.75, s / 2, s);
              ctx.quadraticCurveTo(0, s * 0.75, 0, s * 0.14);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
            fill="#3d4c6b"
            stroke={hiddenAc ? '#fff' : '#c9d4ea'}
            strokeWidth={1.5}
            dash={hiddenAc ? [3, 2] : undefined}
            shadowColor="#000"
            shadowBlur={3}
          />
          <Text text={String(st.ac)} width={shield} height={shield * 0.92} align="center" verticalAlign="middle" fontSize={shield * 0.48} fontStyle="bold" fill="#fff" />
        </Group>
      )}
    </>
  );
}
