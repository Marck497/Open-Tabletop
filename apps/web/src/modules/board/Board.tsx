import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';
import { assetUrl, createResolver, statusesOf, type BoardItem, type BoardLayer, type Fog, type Measure, type Point, type Scene } from '@vtt/shared';
import { useSheets } from '../sheets/store';
import { addCharacterToken } from '../sheets/tokens';
import { useActiveItemId } from '../initiative/store';
import { emitAck, getSocket } from '../../core/socket';
import { clearMeasure, sendPing, setMeasure, snapPoint, snapTemplateEnd } from './measure';
import { MeasuresLayer } from './Measures';
import { DrawingShape, fillOf, textBox } from './Drawing';
import { useBoard } from './store';

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
  const tool = useBoard((s) => s.tool);
  const activeLayer = useBoard((s) => s.activeLayer);
  const select = useBoard((s) => s.select);
  const activeItemId = useActiveItemId();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [fogDraft, setFogDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Dibujo en curso (coordenadas de escena). */
  const [drawDraft, setDrawDraft] = useState<number[] | null>(null);
  /** Midiendo ahora mismo (botón pulsado). */
  const measuring = useRef(false);
  /** Distancia que recorre el token que estoy arrastrando (solo la veo yo). */
  const [dragMeasure, setDragMeasure] = useState<Measure | null>(null);
  const focus = useBoard((s) => s.focus);

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
      const { selectedId, scene, myMeasure, items } = useBoard.getState();
      if (e.key === 'Escape') {
        select(null);
        clearMeasure(isGm);
      }
      // Espacio mientras se mide con la regla: añade un punto intermedio.
      if (e.key === ' ' && measuring.current && myMeasure?.shape === 'ruler' && myMeasure.points.length < 32) {
        e.preventDefault();
        const last = myMeasure.points[myMeasure.points.length - 1]!;
        setMeasure({ ...myMeasure, points: [...myMeasure.points, last] }, isGm);
      }
      const sel = selectedId ? items[selectedId] : undefined;
      const canDelete = isGm || (sel?.drawing && sel.ownerIds.includes(meId));
      if (canDelete && selectedId && scene && (e.key === 'Delete' || e.key === 'Backspace')) {
        void emitAck('item:delete', { sceneId: scene.id, id: selectedId });
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
  const freeTool = !fogTool && !measureTool && !pingTool && !drawTool;

  function pointerInScene(stage: Konva.Stage) {
    return stage.getRelativePointerPosition()!;
  }

  function measurePoint(stage: Konva.Stage, evt: MouseEvent | TouchEvent, shape: Measure['shape']): Point {
    const free = 'altKey' in evt && evt.altKey;
    return snapPoint(pointerInScene(stage), scene!.gridSize, free ? 'free' : shape === 'ruler' ? 'center' : 'half');
  }

  function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage()!;
    if (measureTool) {
      const shape = useBoard.getState().measureShape;
      const p = measurePoint(stage, e.evt, shape);
      measuring.current = true;
      setMeasure({ shape, points: [p, p] }, isGm, { now: true });
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
        const text = prompt('Texto');
        if (text?.trim()) void createDrawing([p.x, p.y], text.trim());
        return;
      }
      setDrawDraft([p.x, p.y, p.x, p.y]);
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

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const mine = useBoard.getState().myMeasure;
    if (measuring.current && mine) {
      const stage = e.target.getStage()!;
      const free = 'altKey' in e.evt && e.evt.altKey;
      const p = mine.shape === 'ruler' || free ? measurePoint(stage, e.evt, mine.shape) : snapTemplateEnd(mine.points[0]!, pointerInScene(stage), scene!.gridSize, mine.shape);
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
    if (!fogDraft) return;
    const p = pointerInScene(e.target.getStage()!);
    setFogDraft({ ...fogDraft, x1: p.x, y1: p.y });
  }

  function onStageMouseUp() {
    if (drawDraft) {
      const pts = drawDraft;
      setDrawDraft(null);
      void createDrawing(pts);
      return;
    }
    if (measuring.current) {
      // La medición se queda a la vista hasta pulsar Esc, empezar otra o cambiar de herramienta.
      measuring.current = false;
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
      return emitAck('item:create', {
        sceneId: scene!.id,
        item: { layer, x: abs[0]!, y: abs[1]!, ...{ width: box.width, height: box.height }, drawing: { type: 'text', text, fontSize, stroke: draw.stroke } },
      });
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
    return emitAck('item:create', {
      sceneId: scene!.id,
      item: {
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
      },
    });
  }

  const itemProps = (item: BoardItem) => ({
    key: item.id,
    item,
    scene,
    selected: item.id === selectedId,
    interactive: freeTool && (isGm ? item.layer === activeLayer : item.layer === 'token' && item.ownerIds.includes(meId)),
    ghost: item.layer === 'gm',
    transformable: isGm || (!!item.drawing && item.ownerIds.includes(meId)),
    turn: item.id === activeItemId,
    onSelect: () => select(item.id),
    onDragPath: setDragMeasure,
  });

  return (
    <div
      ref={containerRef}
      className={`board-container ${freeTool ? '' : 'crosshair'}`}
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
        onDblClick={(e) => {
          // Doble clic en el fondo: ping (con Mayús, el DM centra la vista de todos).
          if (freeTool && (e.target === e.target.getStage() || e.target.name() === 'background')) sendPing(pointerInScene(e.target.getStage()!), isGm && e.evt.shiftKey);
        }}
      >
        <Layer>
          <Rect name="background" width={sceneW} height={sceneH} fill={scene.backgroundColor} />
          {byLayer('map').map((i) => (
            <ItemNode {...itemProps(i)} />
          ))}
          {scene.gridVisible && <Grid scene={scene} />}
        </Layer>
        <Layer>
          {byLayer('token').map((i) => (
            <ItemNode {...itemProps(i)} />
          ))}
        </Layer>
        <Layer listening={false} opacity={isGm ? 0.45 : 1}>
          {scene.fog.enabled && <FogShape fog={scene.fog} width={sceneW} height={sceneH} />}
        </Layer>
        <Layer>
          {isGm && byLayer('gm').map((i) => <ItemNode {...itemProps(i)} />)}
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
          <MeasuresLayer scene={scene} scale={view.scale} dragMeasure={dragMeasure} />
        </Layer>
      </Stage>
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
}

function ItemNode({ item, scene, selected, interactive, ghost, transformable, turn, onSelect, onDragPath }: ItemNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const lastEmit = useRef(0);
  const character = useSheets((s) => (item.characterId ? s.characters[item.characterId] : undefined));
  const template = useSheets((s) => s.template);
  const imageId = item.assetId ?? character?.avatarAssetId ?? null;
  const [image] = useImage(imageId ? assetUrl(imageId) : '');
  const name = item.name || character?.name || '';
  const bars = useMemo(() => {
    if (!character || !template) return [];
    const resolve = createResolver(template, character.values);
    return template.bars.map((b) => {
      const value = Number(resolve(b.value)) || 0;
      const max = b.max ? Number(resolve(b.max)) || 0 : 0;
      return { value, max, color: b.color };
    });
  }, [character, template]);
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

  function onDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    const origin = { x: item.x + w / 2, y: item.y + h / 2 };
    const to = e.evt.altKey ? { x: e.target.x(), y: e.target.y() } : { x: snap(e.target.x() - w / 2, false) + w / 2, y: snap(e.target.y() - h / 2, false) + h / 2 };
    if (!item.drawing) onDragPath({ shape: 'ruler', points: [origin, to] });
    const now = performance.now();
    if (now - lastEmit.current < MOVE_THROTTLE_MS) return;
    lastEmit.current = now;
    getSocket().emit('item:moving', { sceneId: scene.id, id: item.id, x: e.target.x() - w / 2, y: e.target.y() - h / 2 });
  }

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true;
    onDragPath(null);
    // Los dibujos no se ajustan a la cuadrícula.
    const free = e.evt.altKey || !!item.drawing;
    const x = snap(e.target.x() - w / 2, free);
    const y = snap(e.target.y() - h / 2, free);
    e.target.position({ x: x + w / 2, y: y + h / 2 });
    void emitAck('item:update', { sceneId: scene.id, id: item.id, patch: { x, y } }).catch(() => {
      // Si el servidor lo rechaza, volver a la posición guardada.
      e.target.position({ x: item.x + w / 2, y: item.y + h / 2 });
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
    void emitAck('item:update', {
      sceneId: scene.id,
      id: item.id,
      patch: { width: nw, height: nh, x: node.x() - nw / 2, y: node.y() - nh / 2, rotation: node.rotation(), ...(drawing ? { drawing } : {}) },
    });
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
        listening={interactive}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDblClick={() => character && useSheets.getState().openSheet(character.id)}
        onDblTap={() => character && useSheets.getState().openSheet(character.id)}
        onDragStart={(e) => (e.cancelBubble = true)}
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
        {bars.map((b, i) => (
          <Group key={i} y={-8 - i * 8} listening={false}>
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
              <Circle radius={s / 2} fill="rgba(20,18,26,0.8)" stroke="#d6a84a" strokeWidth={1} />
              <Text text={d.icon} fontSize={s * 0.62} width={s} height={s} offsetX={s / 2} offsetY={s / 2} align="center" verticalAlign="middle" />
            </Group>
          );
        })}
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
