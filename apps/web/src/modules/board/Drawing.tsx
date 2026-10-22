import { Ellipse, Line, Rect, Text } from 'react-konva';
import type { Drawing } from '@vtt/shared';

/** Pinta un dibujo en coordenadas locales del elemento (0,0 = su esquina). */
export function DrawingShape({ drawing, width, height }: { drawing: Drawing; width: number; height: number }) {
  const { type, stroke, strokeWidth, fill } = drawing;
  const common = { stroke, strokeWidth, hitStrokeWidth: Math.max(12, strokeWidth), lineCap: 'round' as const, lineJoin: 'round' as const };
  switch (type) {
    case 'path':
      return <Line points={drawing.points} tension={0.4} {...common} />;
    case 'line':
      return <Line points={drawing.points} {...common} />;
    case 'rect':
      return <Rect width={width} height={height} fill={fill || undefined} {...common} />;
    case 'ellipse':
      return <Ellipse x={width / 2} y={height / 2} radiusX={width / 2} radiusY={height / 2} fill={fill || undefined} {...common} />;
    case 'text':
      return <Text text={drawing.text} fontSize={drawing.fontSize} fill={stroke} fontStyle="bold" shadowColor="#000" shadowBlur={4} shadowOpacity={0.9} />;
    case 'stamp':
      return (
        <Text
          text={drawing.text}
          width={width}
          height={height}
          fontSize={Math.min(width, height) * 0.8}
          align="center"
          verticalAlign="middle"
          shadowColor="#000"
          shadowBlur={6}
          shadowOpacity={0.6}
        />
      );
  }
}

/** Color con transparencia para los rellenos (#rrggbb → rgba). */
export function fillOf(color: string, alpha = 0.25) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const n = parseInt(color.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Medida aproximada de un texto (para su caja). */
export function textBox(text: string, fontSize: number) {
  const lines = text.split('\n');
  return { width: Math.max(...lines.map((l) => l.length)) * fontSize * 0.6 + 4, height: lines.length * fontSize * 1.15 };
}
