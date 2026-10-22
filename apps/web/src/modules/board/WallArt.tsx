import { useMemo } from 'react';
import { Shape } from 'react-konva';
import { isDoor, seededRng, type Wall } from '@vtt/shared';
import { shade } from '../mapeditor/textures';

/**
 * Paredes dibujadas como muros de verdad (piedra, madera, cristal) en vez de líneas: las ve
 * toda la mesa, debajo de los tokens. Las paredes automáticas del editor de mapas no se pintan,
 * porque ya las dibuja el suelo. Las texturas se hacen por código, sin imágenes.
 */

type Ctx = CanvasRenderingContext2D;
/** Las texturas se dibujan al doble de resolución para que no se vean borrosas con zoom. */
const RES = 2;

const STONE = '#77716a';
const WOOD = '#7a5230';

/** Azulejo de sillares: dos hileras de bloques al tresbolillo con juntas de mortero. */
function stoneTile(len: number, thick: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(len * RES));
  c.height = Math.max(4, Math.round(thick * RES));
  const ctx = c.getContext('2d')!;
  const rnd = seededRng(97);
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = shade(STONE, -0.45);
  ctx.fillRect(0, 0, W, H);
  const rows = 2;
  const rh = H / rows;
  const bw = W / 2;
  const gap = Math.max(1, H * 0.06);
  for (let r = 0; r < rows; r++) {
    for (let b = -1; b < 3; b++) {
      const x = b * bw + (r % 2 ? bw / 2 : 0);
      ctx.fillStyle = shade(STONE, (rnd() - 0.5) * 0.28);
      ctx.fillRect(x + gap / 2, r * rh + gap / 2, bw - gap, rh - gap);
      // Luz arriba y sombra abajo: el bloque parece tener relieve.
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + gap / 2, r * rh + gap / 2, bw - gap, gap);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + gap / 2, (r + 1) * rh - gap * 1.5, bw - gap, gap);
    }
  }
  for (let i = 0; i < W * H * 0.04; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(rnd() * W, rnd() * H, RES, RES);
  }
  return c;
}

/** Azulejo de tablones de madera a lo largo de la puerta. */
function woodTile(len: number, thick: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(len * RES));
  c.height = Math.max(4, Math.round(thick * RES));
  const ctx = c.getContext('2d')!;
  const rnd = seededRng(41);
  const W = c.width;
  const H = c.height;
  const planks = 3;
  const ph = H / planks;
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = shade(WOOD, (rnd() - 0.5) * 0.25);
    ctx.fillRect(0, p * ph, W, ph);
    ctx.strokeStyle = 'rgba(40,20,5,0.35)';
    ctx.lineWidth = Math.max(1, RES / 2);
    for (let v = 0; v < 3; v++) {
      const y = p * ph + ph * (0.25 + rnd() * 0.5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(W * 0.3, y + (rnd() - 0.5) * ph * 0.4, W * 0.6, y + (rnd() - 0.5) * ph * 0.4, W, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,10,0,0.55)';
    ctx.fillRect(0, (p + 1) * ph - Math.max(1, RES / 2), W, Math.max(1, RES / 2));
  }
  return c;
}

interface Tiles {
  stone: HTMLCanvasElement;
  wood: HTMLCanvasElement;
}

/** Relleno con textura alineado con el tramo (que ya está girado y empieza en 0, -grosor/2). */
function patternFill(ctx: Ctx, tile: HTMLCanvasElement, thick: number) {
  const p = ctx.createPattern(tile, 'repeat')!;
  p.setTransform(new DOMMatrix().translate(0, -thick / 2).scale(1 / RES));
  return p;
}

/** Dibuja un tramo de `len` a lo largo del eje x, centrado en y = 0. */
function band(ctx: Ctx, len: number, thick: number, fill: string | CanvasPattern) {
  ctx.fillStyle = fill;
  ctx.fillRect(0, -thick / 2, len, thick);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = Math.max(1, thick * 0.08);
  ctx.strokeRect(0, -thick / 2, len, thick);
}

function drawWall(ctx: Ctx, w: Wall, thick: number, tiles: Tiles, gm: boolean) {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  if (len < 1) return;
  ctx.save();
  ctx.translate(w.x1, w.y1);
  ctx.rotate(Math.atan2(w.y2 - w.y1, w.x2 - w.x1));
  if (isDoor(w)) {
    const t = thick * 0.6;
    if (w.open) {
      // Hoja abierta, girada sobre la bisagra, y el hueco libre marcado en el suelo.
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, -t / 2, len, t);
      ctx.save();
      ctx.rotate(-Math.PI * 0.42);
      ctx.translate(0, -t / 2);
      band(ctx, len, t, patternFill(ctx, tiles.wood, t));
      ctx.restore();
    } else band(ctx, len, t, patternFill(ctx, tiles.wood, t));
    // La puerta secreta, para el DM, con un tinte morado (los jugadores la ven como muro).
    if (gm && w.kind === 'secret' && !w.open) {
      band(ctx, len, thick, patternFill(ctx, tiles.stone, thick));
      ctx.fillStyle = 'rgba(199,125,232,0.35)';
      ctx.fillRect(0, -thick / 2, len, thick);
    }
  } else if (w.kind === 'window') {
    // Ventana: marco de piedra fino con el cristal en medio.
    band(ctx, len, thick * 0.55, patternFill(ctx, tiles.stone, thick * 0.55));
    ctx.fillStyle = 'rgba(170,215,240,0.85)';
    ctx.fillRect(len * 0.08, -thick * 0.12, len * 0.84, thick * 0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(len * 0.08, -thick * 0.12, len * 0.84, thick * 0.06);
  } else band(ctx, len, thick, patternFill(ctx, tiles.stone, thick));
  ctx.restore();
}

/** Pilar en cada extremo de muro: tapa las juntas entre tramos y los encuadra. */
function drawPost(ctx: Ctx, x: number, y: number, size: number) {
  ctx.fillStyle = shade(STONE, -0.15);
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x - size / 2, y - size / 2, size, size * 0.18);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.strokeRect(x - size / 2, y - size / 2, size, size);
}

export function WallArt({ walls, gridSize, isGm }: { walls: Wall[]; gridSize: number; isGm: boolean }) {
  const thick = Math.max(6, gridSize * 0.24);
  const tiles = useMemo<Tiles>(() => ({ stone: stoneTile(gridSize, thick), wood: woodTile(gridSize, thick * 0.6) }), [gridSize, thick]);
  const drawn = useMemo(() => walls.filter((w) => !w.auto), [walls]);
  if (!drawn.length) return null;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(kctx) => {
        const ctx = kctx._context;
        // Sombra suave de todos los muros sobre el suelo.
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = thick * 0.8;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineCap = 'square';
        ctx.lineWidth = thick;
        ctx.beginPath();
        for (const w of drawn) {
          if (isDoor(w) && w.open) continue;
          ctx.moveTo(w.x1, w.y1);
          ctx.lineTo(w.x2, w.y2);
        }
        ctx.stroke();
        ctx.restore();
        for (const w of drawn) drawWall(ctx, w, thick, tiles, isGm);
        // Pilares en los extremos (uno por punto, aunque lo compartan varios tramos).
        const seen = new Set<string>();
        for (const w of drawn) {
          for (const [x, y] of [
            [w.x1, w.y1],
            [w.x2, w.y2],
          ] as const) {
            const k = `${Math.round(x)},${Math.round(y)}`;
            if (seen.has(k)) continue;
            seen.add(k);
            drawPost(ctx, x, y, thick * 1.2);
          }
        }
      }}
    />
  );
}
