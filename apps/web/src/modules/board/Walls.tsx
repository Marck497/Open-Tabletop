import { useMemo } from 'react';
import { Circle, Group, Line, Shape, Text } from 'react-konva';
import {
  decodeExplored,
  exploredGrid,
  hasLineOfSight,
  isExplored,
  isDoor,
  visibilityPolygon,
  WALL_COLORS,
  type BoardItem,
  type Point,
  type Scene,
  type Wall,
} from '@vtt/shared';
import { emitAck } from '../../core/socket';
import { useBoard } from './store';

/** ¿Es un token que mira? (igual que en el servidor) */
const isEye = (i: BoardItem) => i.layer === 'token' && !i.drawing;
const centerOf = (i: BoardItem): Point => ({ x: i.x + i.width / 2, y: i.y + i.height / 2 });

/**
 * Desde dónde se ve: los tokens del jugador o, en la vista previa del DM, los de todos los jugadores.
 * Devuelve null si la visión no se aplica.
 */
export function useEyes(scene: Scene | null, items: Record<string, BoardItem>, meId: string, isGm: boolean, preview: boolean): Point[] | null {
  return useMemo(() => {
    if (!scene?.vision || (isGm && !preview)) return null;
    const mine = (i: BoardItem) => (isGm ? i.ownerIds.length > 0 : i.ownerIds.includes(meId));
    return Object.values(items)
      .filter((i) => isEye(i) && mine(i))
      .map(centerOf);
  }, [scene?.vision, items, meId, isGm, preview]);
}

/** Paredes y puertas guardadas (con un id nuevo para las que se añaden). */
export function saveWalls(scene: Scene, walls: Wall[]) {
  useBoard.getState().setWalls(walls);
  return emitAck('walls:set', { sceneId: scene.id, walls });
}

let wallSeq = 0;
export const newWallId = () => `w${Date.now().toString(36)}${(wallSeq++).toString(36)}`;

/**
 * Ajusta un punto de la herramienta de paredes: a un extremo de pared cercano o, si no,
 * a la intersección de la cuadrícula más próxima (con Alt, libre).
 */
export function snapWallPoint(p: Point, scene: Scene, scale: number, free: boolean): Point {
  const near = 12 / scale;
  let best: Point | null = null;
  let bestD = near;
  for (const w of scene.walls) {
    for (const q of [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 },
    ]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) [best, bestD] = [q, d];
    }
  }
  if (best) return best;
  if (free) return p;
  const g = scene.gridSize;
  return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
}

/** Paredes vistas por el DM (y editables con la herramienta de paredes). */
export function WallLines({ scene, scale, editing }: { scene: Scene; scale: number; editing: boolean }) {
  const mode = useBoard((s) => s.wallMode);
  const onPick = (w: Wall) => {
    if (mode === 'erase') return void saveWalls(scene, scene.walls.filter((x) => x.id !== w.id));
    if (w.kind !== mode) void saveWalls(scene, scene.walls.map((x) => (x.id === w.id ? { ...x, kind: mode, open: false, locked: false, auto: false } : x)));
  };
  return (
    <Group opacity={editing ? 1 : 0.55} listening={editing}>
      {scene.walls.map((w) => (
        <Line
          key={w.id}
          points={[w.x1, w.y1, w.x2, w.y2]}
          stroke={WALL_COLORS[w.kind]}
          strokeWidth={(editing ? 5 : 3) / scale}
          dash={w.kind === 'window' ? [10 / scale, 6 / scale] : isDoor(w) && w.open ? [4 / scale, 8 / scale] : undefined}
          lineCap="round"
          hitStrokeWidth={14 / scale}
          shadowColor="#000"
          shadowBlur={editing ? 4 : 0}
          onMouseDown={(e) => (e.cancelBubble = true)}
          onClick={() => onPick(w)}
          onTap={() => onPick(w)}
        />
      ))}
      {editing &&
        scene.walls.flatMap((w) => [
          <Circle key={`${w.id}a`} x={w.x1} y={w.y1} radius={4 / scale} fill="#fff" listening={false} />,
          <Circle key={`${w.id}b`} x={w.x2} y={w.y2} radius={4 / scale} fill="#fff" listening={false} />,
        ])}
    </Group>
  );
}

/** Botones de las puertas: clic para abrir o cerrar; el DM, con Mayús, echa o quita la llave. */
export function DoorButtons({ scene, scale, isGm, eyes }: { scene: Scene; scale: number; isGm: boolean; eyes: Point[] | null }) {
  const range = scene.visionRange * scene.gridSize;
  const doors = scene.walls.filter((w) => isDoor(w) && (isGm || w.kind === 'door'));
  const visible = (w: Wall) => {
    if (isGm || !eyes) return true;
    const mid = { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
    return eyes.some((e) => (!range || Math.hypot(e.x - mid.x, e.y - mid.y) <= range) && hasLineOfSight(e, mid, scene.walls, w.id));
  };
  const r = Math.max(9, scene.gridSize * 0.16);
  const toggle = (w: Wall, shift: boolean) => {
    const patch = isGm && shift ? { locked: !w.locked } : { open: !w.open };
    emitAck('door:toggle', { sceneId: scene.id, wallId: w.id, ...patch }).catch((e: Error) => useBoard.getState().showNotice(e.message));
  };
  return (
    <>
      {doors.filter(visible).map((w) => (
        <Group
          key={w.id}
          x={(w.x1 + w.x2) / 2}
          y={(w.y1 + w.y2) / 2}
          onMouseDown={(e) => (e.cancelBubble = true)}
          onClick={(e) => toggle(w, e.evt.shiftKey)}
          onTap={() => toggle(w, false)}
          onMouseEnter={(e) => {
            const c = e.target.getStage()?.container();
            if (c) c.style.cursor = 'pointer';
          }}
          onMouseLeave={(e) => {
            const c = e.target.getStage()?.container();
            if (c) c.style.cursor = '';
          }}
          scaleX={Math.max(1, 0.8 / scale)}
          scaleY={Math.max(1, 0.8 / scale)}
          name="door"
        >
          <Circle radius={r} fill={w.open ? 'rgba(20,18,26,0.55)' : 'rgba(20,18,26,0.9)'} stroke={WALL_COLORS[w.kind]} strokeWidth={2} />
          <Text
            text={w.locked ? '🔒' : '🚪'}
            fontSize={r * 1.1}
            width={r * 2}
            height={r * 2}
            offsetX={r}
            offsetY={r}
            align="center"
            verticalAlign="middle"
            opacity={w.open ? 0.5 : 1}
          />
        </Group>
      ))}
    </>
  );
}

/** Pinta lo explorado en un lienzo pequeño (una celda por subcasilla) que luego se estira sobre la escena. */
function useExploredCanvas(scene: Scene): HTMLCanvasElement | null {
  const { explored, exploration, widthCells, heightCells, gridSize } = scene;
  return useMemo(() => {
    if (!exploration || !explored) return null;
    const g = exploredGrid({ widthCells, heightCells, gridSize });
    const bits = decodeExplored(explored, g);
    const canvas = document.createElement('canvas');
    canvas.width = g.cols;
    canvas.height = g.rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(g.cols, g.rows);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (!isExplored(bits, g, c, r)) continue;
        const i = (r * g.cols + c) * 4;
        // Gris azulado: al ponerlo encima, apaga los colores de lo que ya no se ve.
        img.data[i] = 34;
        img.data[i + 1] = 34;
        img.data[i + 2] = 42;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }, [explored, exploration, widthCells, heightCells, gridSize]);
}

/**
 * Oscuridad de la visión dinámica: negro donde no llega la vista, gris en lo ya
 * explorado (lo guarda el servidor por escena) y despejado lo que ven ahora los tokens.
 */
export function VisionMask({ scene, eyes }: { scene: Scene; eyes: Point[] }) {
  const w = scene.widthCells * scene.gridSize;
  const h = scene.heightCells * scene.gridSize;
  const range = scene.visionRange * scene.gridSize;
  const polygons = useMemo(() => eyes.map((e) => visibilityPolygon(e, scene.walls, w, h, range)), [eyes, scene.walls, w, h, range]);
  const explored = useExploredCanvas(scene);

  return (
    <Shape
      listening={false}
      sceneFunc={(kctx) => {
        const ctx = kctx._context;
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        if (explored) {
          ctx.imageSmoothingEnabled = true;
          ctx.globalCompositeOperation = 'destination-out';
          ctx.drawImage(explored, 0, 0, w, h);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.62;
          ctx.drawImage(explored, 0, 0, w, h);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        for (const poly of polygons) {
          if (poly.length < 3) continue;
          ctx.moveTo(poly[0]!.x, poly[0]!.y);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i]!.x, poly[i]!.y);
          ctx.closePath();
        }
        ctx.fill();
        ctx.restore();
      }}
    />
  );
}
