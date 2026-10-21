import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import useImage from 'use-image';
import { assetUrl, type BoardItem, type BoardLayer, type Fog, type Scene } from '@vtt/shared';
import { emitAck, getSocket } from '../../core/socket';
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [fogDraft, setFogDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

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

  useEffect(() => {
    if (size.width) useBoard.getState().setViewCenter({ x: (size.width / 2 - view.x) / view.scale, y: (size.height / 2 - view.y) / view.scale });
  }, [view, size]);

  // Suprimir / Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const { selectedId, scene } = useBoard.getState();
      if (e.key === 'Escape') select(null);
      if (isGm && selectedId && scene && (e.key === 'Delete' || e.key === 'Backspace')) {
        void emitAck('item:delete', { sceneId: scene.id, id: selectedId });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGm, select]);

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
  const fogTool = isGm && tool !== 'select' && scene.fog.enabled;

  function pointerInScene(stage: Konva.Stage) {
    return stage.getRelativePointerPosition()!;
  }

  function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage()!;
    if (fogTool) {
      const p = pointerInScene(stage);
      setFogDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    // Clic en zona vacía: deseleccionar.
    if (e.target === stage || e.target.name() === 'background') select(null);
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!fogDraft) return;
    const p = pointerInScene(e.target.getStage()!);
    setFogDraft({ ...fogDraft, x1: p.x, y1: p.y });
  }

  function onStageMouseUp() {
    if (!fogDraft || !scene) return;
    const rect = normRect(fogDraft);
    setFogDraft(null);
    if (rect.w < 4 || rect.h < 4) return;
    void emitAck('fog:add', { sceneId: scene.id, op: { mode: tool === 'fog-hide' ? 'hide' : 'reveal', ...rect } });
  }

  const itemProps = (item: BoardItem) => ({
    key: item.id,
    item,
    scene,
    selected: item.id === selectedId,
    interactive: !fogTool && (isGm ? item.layer === activeLayer : item.layer === 'token' && item.ownerIds.includes(meId)),
    ghost: item.layer === 'gm',
    transformable: isGm,
    onSelect: () => select(item.id),
  });

  return (
    <div ref={containerRef} className={`board-container ${fogTool ? 'crosshair' : ''}`}>
      <Stage
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={!fogTool}
        onDragEnd={(e) => e.target === e.target.getStage() && setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))}
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onTouchStart={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onTouchMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onTouchEnd={onStageMouseUp}
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
        </Layer>
      </Stage>
    </div>
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
  onSelect: () => void;
}

function ItemNode({ item, scene, selected, interactive, ghost, transformable, onSelect }: ItemNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const lastEmit = useRef(0);
  const [image] = useImage(item.assetId ? assetUrl(item.assetId) : '');
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
    const now = performance.now();
    if (now - lastEmit.current < MOVE_THROTTLE_MS) return;
    lastEmit.current = now;
    getSocket().emit('item:moving', { sceneId: scene.id, id: item.id, x: e.target.x() - w / 2, y: e.target.y() - h / 2 });
  }

  function onDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true;
    const free = e.evt.altKey;
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
    const nw = Math.max(5, w * node.scaleX());
    const nh = Math.max(5, h * node.scaleY());
    node.scale({ x: 1, y: 1 });
    void emitAck('item:update', {
      sceneId: scene.id,
      id: item.id,
      patch: { width: nw, height: nh, x: node.x() - nw / 2, y: node.y() - nh / 2, rotation: node.rotation() },
    });
  }

  const initials = item.name
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
        onDragStart={(e) => (e.cancelBubble = true)}
        onDragMove={(e) => {
          e.cancelBubble = true;
          onDragMove(e);
        }}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        {image ? (
          <KImage image={image} width={w} height={h} />
        ) : (
          <>
            <Circle x={w / 2} y={h / 2} radius={Math.min(w, h) / 2 - 2} fill={item.color} stroke="#000" strokeWidth={2} />
            <Text text={initials} width={w} height={h} align="center" verticalAlign="middle" fontSize={Math.min(w, h) / 2.6} fill="#fff" fontStyle="bold" />
          </>
        )}
        {selected && !interactive && <Rect width={w} height={h} stroke="#d6a84a" strokeWidth={2} />}
        {item.showName && item.name && (
          <Text
            text={item.name}
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
