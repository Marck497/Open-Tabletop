import { useEffect, useRef, useState } from 'react';
import { Layer, Shape } from 'react-konva';
import type Konva from 'konva';
import { CONE_ANGLE, squareRect, type BoardFx, type Measure, type Scene } from '@vtt/shared';
import { getSocket } from '../../core/socket';
import { useFx } from '../dice/CritFx';

type Pt = { x: number; y: number };

/** Animaciones de ataques y hechizos que llegan del servidor, encima de todo el tablero. */
export function FxLayer({ scene, scale }: { scene: Scene; scale: number }) {
  const [list, setList] = useState<BoardFx[]>([]);

  useEffect(() => {
    setList([]);
    const socket = getSocket();
    const onFx = ({ sceneId, fx }: { sceneId: string; fx: BoardFx }) => {
      if (sceneId !== scene.id || !useFx.getState().board) return;
      // Como mucho unas pocas a la vez: en una Raspberry o un móvil no hace falta más.
      setList((l) => [...l.slice(-5), fx]);
    };
    socket.on('board:fx', onFx);
    return () => {
      socket.off('board:fx', onFx);
    };
  }, [scene.id]);

  if (!list.length) return null;
  return (
    <Layer listening={false}>
      {list.map((fx) => (
        <FxNode key={fx.id} fx={fx} grid={scene.gridSize} scale={scale} onDone={() => setList((l) => l.filter((x) => x.id !== fx.id))} />
      ))}
    </Layer>
  );
}

const ease = (k: number) => 1 - (1 - k) ** 3;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: Pt, b: Pt, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/** Color #rrggbb con transparencia. */
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16) || 0xffffff;
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${clamp01(alpha)})`;
}

/** Centro de un área (donde estalla el proyectil): el de la esfera o el cubo; los conos y líneas salen del lanzador. */
function areaCenter(area: Measure): Pt | null {
  if (area.shape === 'circle') return area.points[0]!;
  if (area.shape === 'square') {
    const r = squareRect(area);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  return null;
}

interface Plan {
  /** Duración del viaje del proyectil y del impacto (ms). */
  travel: number;
  impact: number;
  /** A dónde viaja (vacío = no hay viaje). */
  dests: Pt[];
}

function planOf(fx: BoardFx, grid: number): Plan {
  const impact = (fx.style === 'slash' ? 520 : fx.style === 'heal' || fx.style === 'aura' ? 1100 : 700) * (fx.crit ? 1.3 : 1);
  const projectile = fx.style === 'arrow' || fx.style === 'bolt' || fx.style === 'burst';
  const center = fx.area ? areaCenter(fx.area) : null;
  const dests = fx.style === 'burst' && fx.area ? (center ? [center] : []) : fx.to;
  if (!projectile || !fx.from || !dests.length) return { travel: 0, impact, dests };
  const far = Math.max(...dests.map((d) => Math.hypot(d.x - fx.from!.x, d.y - fx.from!.y)));
  // Unas 14 casillas por segundo, entre un cuarto y dos tercios de segundo.
  return { travel: Math.max(250, Math.min(650, (far / (grid * 14)) * 1000)), impact, dests };
}

function FxNode({ fx, grid, scale, onDone }: { fx: BoardFx; grid: number; scale: number; onDone: () => void }) {
  const ref = useRef<Konva.Shape>(null);
  const start = useRef(performance.now());
  const plan = useRef(planOf(fx, grid));
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let raf = 0;
    const total = plan.current.travel + plan.current.impact;
    const step = () => {
      ref.current?.getLayer()?.batchDraw();
      if (performance.now() - start.current < total) raf = requestAnimationFrame(step);
      else done.current();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Shape
      ref={ref}
      sceneFunc={(kctx) => {
        const ctx = kctx._context;
        const t = performance.now() - start.current;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        draw(ctx, fx, plan.current, t, grid, 1 / scale);
        ctx.restore();
      }}
    />
  );
}

/** Pinta el fotograma `t` (ms desde el inicio). `px` = un píxel de pantalla en unidades de escena. */
function draw(ctx: CanvasRenderingContext2D, fx: BoardFx, plan: Plan, t: number, grid: number, px: number) {
  const { color, crit } = fx;
  const big = crit ? 1.35 : 1;
  const travelK = plan.travel ? clamp01(t / plan.travel) : 1;
  const k = clamp01((t - plan.travel) / plan.impact);
  // Si no hay a quién, se anima sobre quien lo hace.
  const spots = fx.to.length ? fx.to : fx.from ? [{ ...fx.from, r: grid / 2 }] : [];

  if (plan.travel && t < plan.travel) {
    for (const d of plan.dests) {
      const p = lerp(fx.from!, d, fx.style === 'arrow' ? travelK : ease(travelK));
      if (fx.style === 'arrow') arrow(ctx, fx.from!, p, grid, color, px);
      else orb(ctx, fx.from!, p, grid * 0.2 * big, color);
    }
    return;
  }

  switch (fx.style) {
    case 'slash':
      for (const s of spots) slash(ctx, fx.from, s, k, color, px, crit);
      break;
    case 'arrow':
      for (const s of spots) puff(ctx, s, s.r * 0.9 * big, k, color, px);
      break;
    case 'bolt':
      for (const s of spots) explosion(ctx, s, Math.max(s.r * 1.2, grid * 0.6) * big, k, color, px, 6);
      break;
    case 'beam':
      if (fx.from) for (const s of spots) beam(ctx, fx.from, s, grid * 0.22 * big, k, color);
      for (const s of spots) puff(ctx, s, s.r * big, k, color, px);
      break;
    case 'burst':
      if (fx.area) areaFlash(ctx, fx.area, grid, k, color, px);
      if (fx.area) for (const s of fx.to) puff(ctx, s, s.r * 0.8, k, color, px);
      else for (const s of spots) explosion(ctx, s, Math.max(s.r * 1.8, grid * 1.2) * big, k, color, px, 12);
      break;
    case 'heal':
      for (const s of spots) sparkles(ctx, s, s.r * big, k, color, px);
      break;
    case 'aura':
      for (const s of spots) rings(ctx, s, s.r * 1.6 * big, k, color, px);
      break;
  }
}

/** Orbe brillante con estela. */
function orb(ctx: CanvasRenderingContext2D, from: Pt, p: Pt, r: number, color: string) {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 5; i >= 0; i--) {
    const back = i * r * 0.8;
    const q = { x: p.x - (dx / len) * Math.min(back, len), y: p.y - (dy / len) * Math.min(back, len) };
    glow(ctx, q, r * (1 - i * 0.13), color, 0.9 - i * 0.14);
  }
  glow(ctx, p, r * 0.45, '#ffffff', 0.9);
}

/** Flecha (o virote) en vuelo. */
function arrow(ctx: CanvasRenderingContext2D, from: Pt, p: Pt, grid: number, color: string, px: number) {
  const a = Math.atan2(p.y - from.y, p.x - from.x);
  const L = grid * 0.55;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.strokeStyle = rgba('#ffffff', 0.25);
  ctx.lineWidth = 6 * px;
  ctx.beginPath();
  ctx.moveTo(-L * 1.8, 0);
  ctx.lineTo(-L, 0);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * px;
  ctx.beginPath();
  ctx.moveTo(-L, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(4 * px, 0);
  ctx.lineTo(-10 * px, -6 * px);
  ctx.lineTo(-10 * px, 6 * px);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Tajo: uno (o dos cruzados en un crítico) arcos que barren el objetivo. */
function slash(ctx: CanvasRenderingContext2D, from: Pt | null, s: Pt & { r: number }, k: number, color: string, px: number, crit: boolean) {
  const facing = from && (from.x !== s.x || from.y !== s.y) ? Math.atan2(s.y - from.y, s.x - from.x) : -Math.PI / 4;
  const cuts = crit ? [facing + Math.PI / 2, facing] : [facing + Math.PI / 2];
  cuts.forEach((dir, i) => {
    const kk = clamp01(k * 1.6 - i * 0.25);
    if (kk <= 0) return;
    const R = s.r * 1.5;
    const sweep = Math.PI * 0.9;
    const a0 = dir - sweep / 2;
    const head = a0 + sweep * ease(clamp01(kk * 1.5));
    const tail = a0 + sweep * ease(clamp01(kk * 1.5 - 0.45));
    const fade = 1 - clamp01((kk - 0.6) / 0.4);
    // El arco se centra un poco detrás del objetivo para que la hoja lo cruce.
    const cx = s.x - Math.cos(dir) * R * 0.55;
    const cy = s.y - Math.sin(dir) * R * 0.55;
    ctx.strokeStyle = rgba(color, 0.35 * fade);
    ctx.lineWidth = Math.max(16 * px, s.r * 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, R, tail, head);
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.95 * fade);
    ctx.lineWidth = Math.max(4 * px, s.r * 0.1);
    ctx.beginPath();
    ctx.arc(cx, cy, R, tail, head);
    ctx.stroke();
  });
  if (k > 0.25) glow(ctx, s, s.r * 0.7 * (crit ? 1.4 : 1), color, 0.5 * (1 - k));
}

/** Pequeño destello de impacto. */
function puff(ctx: CanvasRenderingContext2D, s: Pt, r: number, k: number, color: string, px: number) {
  glow(ctx, s, r * (0.4 + 0.6 * ease(k)), color, 0.7 * (1 - k));
  ctx.strokeStyle = rgba(color, 0.9 * (1 - k));
  ctx.lineWidth = 3 * px;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * (0.3 + 0.9 * ease(k)), 0, Math.PI * 2);
  ctx.stroke();
}

/** Explosión: bola que crece, onda y chispas. */
function explosion(ctx: CanvasRenderingContext2D, s: Pt, r: number, k: number, color: string, px: number, sparks: number) {
  const e = ease(k);
  glow(ctx, s, r * (0.3 + 0.7 * e), color, 0.9 * (1 - k));
  glow(ctx, s, r * 0.35 * (1 - k), '#ffffff', 0.8 * (1 - k));
  ctx.strokeStyle = rgba(color, 0.8 * (1 - k));
  ctx.lineWidth = 4 * px;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * (0.2 + 1.0 * e), 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.8 * (1 - k));
  ctx.lineWidth = 2 * px;
  for (let i = 0; i < sparks; i++) {
    const a = (i / sparks) * Math.PI * 2 + i * 0.7;
    const d0 = r * (0.3 + 0.8 * e);
    const d1 = d0 + r * 0.25 * (1 - k);
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(a) * d0, s.y + Math.sin(a) * d0);
    ctx.lineTo(s.x + Math.cos(a) * d1, s.y + Math.sin(a) * d1);
    ctx.stroke();
  }
}

/** Rayo continuo del lanzador al objetivo. */
function beam(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, w: number, k: number, color: string) {
  const grow = clamp01(k * 4);
  const end = lerp(from, to, grow);
  const fade = 1 - clamp01((k - 0.5) / 0.5);
  const wobble = 0.75 + 0.25 * Math.sin(k * 40);
  ctx.strokeStyle = rgba(color, 0.45 * fade);
  ctx.lineWidth = w * 2 * wobble;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.9 * fade);
  ctx.lineWidth = w * 0.5;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

/** El área de la plantilla se ilumina y se apaga (esfera, cono, línea o cubo). */
function areaFlash(ctx: CanvasRenderingContext2D, area: Measure, grid: number, k: number, color: string, px: number) {
  const a = area.points[0]!;
  const b = area.points[area.points.length - 1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const e = ease(clamp01(k * 1.8));
  const alpha = 0.55 * (1 - clamp01((k - 0.35) / 0.65));
  ctx.save();
  ctx.beginPath();
  if (area.shape === 'circle') ctx.arc(a.x, a.y, len * (0.25 + 0.75 * e), 0, Math.PI * 2);
  else if (area.shape === 'cone') {
    ctx.moveTo(a.x, a.y);
    ctx.arc(a.x, a.y, len * e, ang - CONE_ANGLE / 2, ang + CONE_ANGLE / 2);
    ctx.closePath();
  } else if (area.shape === 'line') {
    ctx.translate(a.x, a.y);
    ctx.rotate(ang);
    ctx.rect(0, -grid / 2, len * e, grid);
  } else {
    const r = squareRect(area);
    const sc = 0.3 + 0.7 * e;
    ctx.rect(r.x + (r.w * (1 - sc)) / 2, r.y + (r.h * (1 - sc)) / 2, r.w * sc, r.h * sc);
  }
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', alpha);
  ctx.lineWidth = 3 * px;
  ctx.stroke();
  ctx.restore();
}

/** Chispas que suben y un anillo suave (curación). */
function sparkles(ctx: CanvasRenderingContext2D, s: Pt, r: number, k: number, color: string, px: number) {
  const fade = 1 - clamp01((k - 0.6) / 0.4);
  ctx.strokeStyle = rgba(color, 0.6 * fade);
  ctx.lineWidth = 3 * px;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * (0.8 + 0.4 * ease(k)), 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 10; i++) {
    const delay = (i % 5) * 0.08;
    const kk = clamp01((k - delay) / (1 - delay));
    if (kk <= 0) continue;
    const x = s.x + Math.cos(i * 2.4) * r * 0.7 + Math.sin(kk * 6 + i) * r * 0.12;
    const y = s.y + Math.sin(i * 1.7) * r * 0.4 - kk * r * 1.4;
    const size = (4 + (i % 3) * 2) * px * (1 - kk * 0.5);
    const al = 0.95 * (1 - kk);
    ctx.strokeStyle = rgba(i % 2 ? '#ffffff' : color, al);
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }
}

/** Dos ondas que se expanden (aura de un hechizo sin daño). */
function rings(ctx: CanvasRenderingContext2D, s: Pt, r: number, k: number, color: string, px: number) {
  glow(ctx, s, r * 0.7, color, 0.35 * (1 - k));
  [0, 0.3].forEach((delay) => {
    const kk = clamp01((k - delay) / (1 - delay));
    if (kk <= 0) return;
    ctx.strokeStyle = rgba(color, 0.9 * (1 - kk));
    ctx.lineWidth = 4 * px;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * (0.3 + 0.7 * ease(kk)), 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Círculo con degradado radial (brillo). */
function glow(ctx: CanvasRenderingContext2D, p: Pt, r: number, color: string, alpha: number) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.5, rgba(color, alpha * 0.5));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}
