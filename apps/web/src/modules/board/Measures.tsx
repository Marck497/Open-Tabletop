import { useEffect, useMemo, useState } from 'react';
import { Arrow, Circle, Group, Label, Line, Rect, Shape, Tag, Text, Wedge } from 'react-konva';
import { CONE_ANGLE, cellsInArea, formatDistance, measureCells, squareRect, type Measure, type Scene } from '@vtt/shared';
import { useBoard } from './store';

/** Todas las mediciones y pings de la escena (las mías, las de los demás y la del token que arrastro). */
export function MeasuresLayer({ scene, scale, dragMeasure }: { scene: Scene; scale: number; dragMeasure: Measure | null }) {
  const mine = useBoard((s) => s.myMeasure);
  const remote = useBoard((s) => s.remoteMeasures);
  const pings = useBoard((s) => s.pings);
  return (
    <Group listening={false}>
      {Object.values(remote).map((r) => (
        <MeasureNode key={r.userId} measure={r.measure} scene={scene} scale={scale} color={r.color} who={r.name} />
      ))}
      {mine && <MeasureNode measure={mine} scene={scene} scale={scale} color="#d6a84a" />}
      {dragMeasure && <MeasureNode measure={dragMeasure} scene={scene} scale={scale} color="#d6a84a" />}
      {pings.map((p) => (
        <PingNode key={p.id} x={p.x} y={p.y} color={p.color} scale={scale} />
      ))}
    </Group>
  );
}

interface MeasureProps {
  measure: Measure;
  scene: Scene;
  scale: number;
  color: string;
  who?: string;
}

function MeasureNode({ measure, scene, scale, color, who }: MeasureProps) {
  const { points, shape } = measure;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const g = scene.gridSize;
  const px = 1 / scale;
  const cells = useMemo(() => cellsInArea(measure, scene), [measure, scene]);
  const label = formatDistance(measureCells(measure, scene), scene) + (who ? ` · ${who}` : '');
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const area = { stroke: color, strokeWidth: 2 * px, fill: withAlpha(color, 0.12) };

  return (
    <Group>
      {cells.length > 0 && (
        <Shape
          sceneFunc={(ctx, s) => {
            ctx.beginPath();
            for (const c of cells) ctx.rect(c.col * g, c.row * g, g, g);
            ctx.fillShape(s);
          }}
          fill={withAlpha(color, 0.22)}
        />
      )}
      {shape === 'ruler' && (
        <>
          <Line points={points.flatMap((p) => [p.x, p.y])} stroke="#000" strokeWidth={6 * px} opacity={0.5} lineCap="round" lineJoin="round" />
          <Arrow
            points={points.flatMap((p) => [p.x, p.y])}
            stroke={color}
            fill={color}
            strokeWidth={3 * px}
            pointerLength={12 * px}
            pointerWidth={12 * px}
            lineCap="round"
            lineJoin="round"
            dash={[12 * px, 6 * px]}
          />
          {points.slice(0, -1).map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={5 * px} fill={color} />
          ))}
        </>
      )}
      {shape === 'circle' && <Circle x={a.x} y={a.y} radius={len} {...area} />}
      {shape === 'cone' && <Wedge x={a.x} y={a.y} radius={len} angle={(CONE_ANGLE * 180) / Math.PI} rotation={angle - (CONE_ANGLE * 90) / Math.PI} {...area} />}
      {shape === 'line' && <Rect x={a.x} y={a.y} width={len} height={g} offsetY={g / 2} rotation={angle} {...area} />}
      {shape === 'square' && (() => {
        const r = squareRect(measure);
        return <Rect x={r.x} y={r.y} width={r.w} height={r.h} {...area} />;
      })()}
      {shape !== 'ruler' && <Circle x={a.x} y={a.y} radius={4 * px} fill={color} />}
      <Label x={b.x + 14 * px} y={b.y - 14 * px}>
        <Tag fill="rgba(20,18,26,0.85)" stroke={color} strokeWidth={px} cornerRadius={4 * px} />
        <Text text={label} fontSize={14 * px} padding={5 * px} fill="#fff" fontStyle="bold" />
      </Label>
    </Group>
  );
}

const PING_DURATION = 1600;

/** Ondas que se expanden donde alguien ha hecho ping. */
function PingNode({ x, y, color, scale }: { x: number; y: number; color: string; scale: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / PING_DURATION);
      setT(k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  const px = 1 / scale;
  return (
    <Group x={x} y={y} opacity={1 - t}>
      {[0, 0.3].map((delay) => {
        const k = Math.max(0, t - delay) / (1 - delay);
        return <Circle key={delay} radius={(10 + 60 * k) * px} stroke={color} strokeWidth={4 * px} />;
      })}
      <Circle radius={6 * px} fill={color} />
    </Group>
  );
}

/** Añade transparencia a un color hsl(...) o #rrggbb. */
function withAlpha(color: string, alpha: number) {
  if (color.startsWith('hsl(')) return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return color;
}
