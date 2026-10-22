import { isSolidCell, seededRng, terrainById, TERRAIN_EMPTY } from '@vtt/shared';

/**
 * Texturas del suelo dibujadas por código (no hacen falta imágenes): cada terreno es un
 * azulejo de 2×2 casillas que se repite sin costuras.
 */

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;

/** Aclara (amt > 0) u oscurece (amt < 0) un color #rrggbb. */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Dibuja algo en (x, y) y en sus copias al otro lado de los bordes, para que el azulejo case. */
function wrap(S: number, x: number, y: number, draw: (x: number, y: number) => void) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(x + ox, y + oy);
}

function blotches(ctx: Ctx, S: number, rnd: Rnd, n: number, base: string, spread: number, rMin: number, rMax: number, alpha = 0.35) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = rMin + rnd() * (rMax - rMin);
    ctx.fillStyle = shade(base, (rnd() - 0.5) * 2 * spread);
    ctx.globalAlpha = alpha;
    wrap(S, x, y, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}

function speckle(ctx: Ctx, S: number, rnd: Rnd, n: number, colors: string[], size: number, alpha = 0.5) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)]!;
    ctx.fillRect(rnd() * S, rnd() * S, size, size);
  }
  ctx.globalAlpha = 1;
}

function cracks(ctx: Ctx, S: number, rnd: Rnd, n: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < n; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    const pts: [number, number][] = [[x, y]];
    let a = rnd() * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      a += (rnd() - 0.5) * 1.4;
      x += Math.cos(a) * S * 0.06;
      y += Math.sin(a) * S * 0.06;
      pts.push([x, y]);
    }
    wrap(S, 0, 0, (ox, oy) => {
      ctx.beginPath();
      pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
      ctx.stroke();
    });
  }
}

const PAINTERS: Record<string, (ctx: Ctx, S: number, rnd: Rnd, base: string) => void> = {
  // Losas: una por casilla, cada una de un tono, con juntas oscuras.
  p(ctx, S, rnd, base) {
    const c = S / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.18);
        ctx.fillRect(i * c, j * c, c, c);
      }
    speckle(ctx, S, rnd, S * 3, ['#000', '#fff'], Math.max(1, S / 90), 0.12);
    cracks(ctx, S, rnd, 3, 'rgba(0,0,0,0.25)', Math.max(1, S / 140));
    ctx.strokeStyle = 'rgba(20,18,16,0.7)';
    ctx.lineWidth = Math.max(1.5, S / 50);
    for (const v of [0, c, S]) {
      ctx.beginPath();
      ctx.moveTo(v, 0);
      ctx.lineTo(v, S);
      ctx.moveTo(0, v);
      ctx.lineTo(S, v);
      ctx.stroke();
    }
  },
  // Adoquines: piedras redondeadas en una rejilla desordenada.
  c(ctx, S, rnd, base) {
    ctx.fillStyle = shade(base, -0.45);
    ctx.fillRect(0, 0, S, S);
    const n = 6;
    const step = S / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const x = (i + 0.5 + (j % 2) * 0.5) * step + (rnd() - 0.5) * step * 0.15;
        const y = (j + 0.5) * step + (rnd() - 0.5) * step * 0.15;
        const rx = step * (0.38 + rnd() * 0.08);
        const ry = step * (0.36 + rnd() * 0.08);
        ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.3);
        wrap(S, x, y, (px, py) => {
          ctx.beginPath();
          ctx.ellipse(px, py, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    speckle(ctx, S, rnd, S * 2, ['#000', '#fff'], Math.max(1, S / 100), 0.1);
  },
  // Madera: tablones horizontales con vetas y juntas.
  w(ctx, S, rnd, base) {
    const rows = 6;
    const ph = S / rows;
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.22);
      ctx.fillRect(0, r * ph, S, ph);
      ctx.strokeStyle = 'rgba(40,20,5,0.25)';
      ctx.lineWidth = Math.max(0.5, S / 300);
      for (let k = 0; k < 3; k++) {
        const y = r * ph + ph * (0.2 + rnd() * 0.6);
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= S; x += S / 8) ctx.lineTo(x, y + Math.sin(x / S * Math.PI * 4 + k) * ph * 0.05);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,15,5,0.65)';
      ctx.fillRect(0, r * ph, S, Math.max(1, S / 120));
      const joint = rnd() * S;
      ctx.fillRect(joint, r * ph, Math.max(1, S / 120), ph);
    }
  },
  // Baldosas: ajedrezado claro y oscuro.
  b(ctx, S, rnd, base) {
    const n = 4;
    const t = S / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(base, (i + j) % 2 ? -0.35 : 0.05 + (rnd() - 0.5) * 0.06);
        ctx.fillRect(i * t, j * t, t, t);
      }
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = Math.max(1, S / 160);
    for (let k = 0; k <= n; k++) {
      ctx.beginPath();
      ctx.moveTo(k * t, 0);
      ctx.lineTo(k * t, S);
      ctx.moveTo(0, k * t);
      ctx.lineTo(S, k * t);
      ctx.stroke();
    }
  },
  // Mármol: claro con vetas.
  m(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 20, base, 0.06, S * 0.05, S * 0.15, 0.4);
    ctx.lineWidth = Math.max(0.7, S / 180);
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(90,90,100,${0.2 + rnd() * 0.25})`;
      const y0 = rnd() * S;
      const y1 = rnd() * S;
      wrap(S, 0, 0, (ox, oy) => {
        ctx.beginPath();
        ctx.moveTo(ox, y0 + oy);
        ctx.bezierCurveTo(S * 0.33 + ox, rnd() * S + oy, S * 0.66 + ox, rnd() * S + oy, S + ox, y1 + oy);
        ctx.stroke();
      });
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = Math.max(1, S / 160);
    ctx.strokeRect(0, 0, S / 2, S / 2);
    ctx.strokeRect(S / 2, S / 2, S / 2, S / 2);
  },
  // Alfombra: rombos dorados sobre rojo.
  k(ctx, S, rnd, base) {
    speckle(ctx, S, rnd, S * 4, [shade(base, -0.2), shade(base, 0.1)], Math.max(1, S / 120), 0.4);
    ctx.strokeStyle = 'rgba(214,168,74,0.45)';
    ctx.lineWidth = Math.max(1, S / 90);
    const t = S / 4;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const cx = i * t + t / 2;
        const cy = j * t + t / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - t * 0.4);
        ctx.lineTo(cx + t * 0.4, cy);
        ctx.lineTo(cx, cy + t * 0.4);
        ctx.lineTo(cx - t * 0.4, cy);
        ctx.closePath();
        ctx.stroke();
      }
  },
  // Cueva: manchas terrosas y piedrecitas.
  o(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 40, base, 0.2, S * 0.04, S * 0.14, 0.35);
    speckle(ctx, S, rnd, S * 3, ['#1a1612', '#a09080'], Math.max(1, S / 80), 0.25);
    cracks(ctx, S, rnd, 2, 'rgba(0,0,0,0.2)', Math.max(1, S / 160));
  },
  // Hierba: manchas verdes y briznas.
  g(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 50, base, 0.2, S * 0.04, S * 0.12, 0.3);
    ctx.lineWidth = Math.max(0.8, S / 200);
    for (let i = 0; i < S * 1.2; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      ctx.strokeStyle = shade(base, (rnd() - 0.3) * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * S * 0.03, y - S * (0.015 + rnd() * 0.025));
      ctx.stroke();
    }
  },
  // Tierra: manchas y guijarros.
  d(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 45, base, 0.2, S * 0.03, S * 0.12, 0.35);
    blotches(ctx, S, rnd, 25, '#8a8070', 0.2, S * 0.006, S * 0.014, 0.8);
  },
  // Arena: grano fino y ondas suaves.
  s(ctx, S, rnd, base) {
    speckle(ctx, S, rnd, S * 8, [shade(base, -0.15), shade(base, 0.15)], Math.max(1, S / 140), 0.5);
    ctx.strokeStyle = 'rgba(120,90,40,0.18)';
    ctx.lineWidth = Math.max(1, S / 120);
    for (let k = 0; k < 6; k++) {
      const y = (k + rnd() * 0.5) * (S / 6);
      ctx.beginPath();
      for (let x = 0; x <= S; x += S / 16) ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * 4) * S * 0.02);
      ctx.stroke();
    }
  },
  // Nieve: blanco azulado con brillos.
  n(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 30, base, 0.08, S * 0.05, S * 0.16, 0.4);
    blotches(ctx, S, rnd, 15, '#b8c8dc', 0.1, S * 0.03, S * 0.08, 0.25);
    speckle(ctx, S, rnd, S, ['#ffffff'], Math.max(1, S / 120), 0.9);
  },
  // Bosque: copas de árboles vistas desde arriba.
  f(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 20, base, 0.2, S * 0.05, S * 0.12, 0.4);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = S * (0.08 + rnd() * 0.07);
      const tone = (rnd() - 0.5) * 0.3;
      wrap(S, x, y, (px, py) => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.arc(px + r * 0.15, py + r * 0.2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade('#3d6b2c', tone);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade('#5c8f3e', tone);
        ctx.beginPath();
        ctx.arc(px - r * 0.25, py - r * 0.25, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },
  // Agua: manchas y ondas claras.
  a(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 30, base, 0.15, S * 0.06, S * 0.16, 0.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1, S / 110);
    for (let i = 0; i < 10; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = S * (0.04 + rnd() * 0.04);
      wrap(S, x, y, (px, py) => {
        ctx.beginPath();
        ctx.arc(px, py, r, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      });
    }
  },
  A(ctx, S, rnd, base) {
    PAINTERS.a!(ctx, S, rnd, base);
    blotches(ctx, S, rnd, 12, '#0b2440', 0.1, S * 0.1, S * 0.2, 0.25);
  },
  // Pantano: barro verdoso, charcos y juncos.
  v(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 40, base, 0.25, S * 0.04, S * 0.13, 0.35);
    blotches(ctx, S, rnd, 8, '#2f4a3a', 0.15, S * 0.05, S * 0.1, 0.6);
    ctx.strokeStyle = '#6b7a3a';
    ctx.lineWidth = Math.max(1, S / 150);
    for (let i = 0; i < 25; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * S * 0.02, y - S * 0.05);
      ctx.stroke();
    }
  },
  // Hielo: azul claro con vetas blancas y grietas.
  h(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 20, base, 0.1, S * 0.08, S * 0.18, 0.35);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, S / 120);
    for (let i = 0; i < 8; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + S * 0.12, y - S * 0.05);
      ctx.stroke();
    }
    cracks(ctx, S, rnd, 3, 'rgba(60,110,140,0.4)', Math.max(1, S / 160));
  },
  // Lava: costra oscura con ríos incandescentes.
  l(ctx, S, rnd) {
    ctx.fillStyle = '#3a0d05';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 14; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = S * (0.08 + rnd() * 0.12);
      wrap(S, x, y, (px, py) => {
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,230,120,0.95)');
        g.addColorStop(0.4, 'rgba(250,120,20,0.85)');
        g.addColorStop(1, 'rgba(160,30,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    cracks(ctx, S, rnd, 6, 'rgba(30,5,0,0.8)', Math.max(1.5, S / 70));
  },
  // Abismo: casi negro, con profundidad.
  x(ctx, S, rnd) {
    ctx.fillStyle = '#060509';
    ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, rnd, 12, '#1a1726', 0.2, S * 0.08, S * 0.2, 0.3);
  },
  // Roca maciza.
  r(ctx, S, rnd, base) {
    blotches(ctx, S, rnd, 35, base, 0.25, S * 0.05, S * 0.15, 0.4);
    cracks(ctx, S, rnd, 6, 'rgba(0,0,0,0.45)', Math.max(1, S / 90));
    speckle(ctx, S, rnd, S * 2, ['#777', '#111'], Math.max(1, S / 90), 0.3);
  },
  // Ladrillo.
  B(ctx, S, rnd, base) {
    ctx.fillStyle = '#2a201a';
    ctx.fillRect(0, 0, S, S);
    const rows = 8;
    const bh = S / rows;
    const bw = S / 4;
    const gap = Math.max(1, S / 100);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let k = -1; k < 5; k++) {
        ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.3);
        ctx.fillRect(k * bw + off + gap / 2, r * bh + gap / 2, bw - gap, bh - gap);
      }
    }
    speckle(ctx, S, rnd, S * 2, ['#000'], Math.max(1, S / 100), 0.2);
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/** Azulejo de un terreno para casillas de `cell` píxeles (cubre 2×2 casillas). */
export function textureFor(id: string, cell: number): HTMLCanvasElement {
  const key = `${id}:${cell}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = terrainById(id);
  const S = Math.max(8, Math.round(cell * 2));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const base = def?.color ?? '#888888';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  PAINTERS[id]?.(ctx, S, seededRng(id.charCodeAt(0) * 7919), base);
  cache.set(key, canvas);
  return canvas;
}

/** Vista previa pequeña para la paleta (data URL). */
const previews = new Map<string, string>();
export function texturePreview(id: string) {
  if (!previews.has(id)) previews.set(id, textureFor(id, 20).toDataURL());
  return previews.get(id)!;
}

/** Píxeles por casilla del lienzo del suelo (se reduce en mapas grandes para no gastar demasiada memoria). */
export function pixelsPerCell(w: number, h: number, gridSize: number) {
  return Math.max(6, Math.min(gridSize, Math.floor(Math.sqrt(12_000_000 / (w * h))), Math.floor(8192 / Math.max(w, h))));
}

/**
 * Pinta en el lienzo las casillas indicadas (o todas): textura, sombra donde el suelo toca
 * una pared o el vacío y una línea suave entre suelos distintos.
 */
export function paintTerrain(canvas: HTMLCanvasElement, terrain: string, w: number, h: number, ppc: number, only?: Iterable<number>) {
  const ctx = canvas.getContext('2d')!;
  const patterns = new Map<string, CanvasPattern>();
  const pattern = (id: string) => {
    let p = patterns.get(id);
    if (!p) patterns.set(id, (p = ctx.createPattern(textureFor(id, ppc), 'repeat')!));
    return p;
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? undefined : terrain[y * w + x]);
  const shadow = Math.max(3, ppc * 0.22);

  const cellsToPaint = only ?? Array.from({ length: w * h }, (_, i) => i);
  for (const i of cellsToPaint) {
    const x = i % w;
    const y = Math.floor(i / w);
    const px = x * ppc;
    const py = y * ppc;
    ctx.clearRect(px, py, ppc, ppc);
    const code = terrain[i];
    if (!code || code === TERRAIN_EMPTY) continue;
    ctx.fillStyle = pattern(code);
    ctx.fillRect(px, py, ppc, ppc);
    const solid = isSolidCell(code);
    const sides = [
      [0, -1, px, py, px, py + shadow, px, py, ppc, shadow],
      [0, 1, px, py + ppc, px, py + ppc - shadow, px, py + ppc - shadow, ppc, shadow],
      [-1, 0, px, py, px + shadow, py, px, py, shadow, ppc],
      [1, 0, px + ppc, py, px + ppc - shadow, py, px + ppc - shadow, py, shadow, ppc],
    ] as const;
    for (const [dx, dy, gx0, gy0, gx1, gy1, rx, ry, rw, rh] of sides) {
      const n = at(x + dx, y + dy);
      if (n === undefined) continue;
      if (!solid && isSolidCell(n)) {
        // Sombra hacia dentro del suelo junto a la pared.
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      } else if (solid && n !== TERRAIN_EMPTY && !isSolidCell(n)) {
        // Canto iluminado del muro que da al suelo.
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        const t = Math.max(1, ppc * 0.05);
        ctx.fillRect(dx === 1 ? px + ppc - t : px, dy === 1 ? py + ppc - t : py, dx ? t : ppc, dy ? t : ppc);
      } else if (n !== code && n !== TERRAIN_EMPTY && !solid) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        const t = Math.max(1, ppc * 0.025);
        ctx.fillRect(dx === 1 ? px + ppc - t : px, dy === 1 ? py + ppc - t : py, dx ? t : ppc, dy ? t : ppc);
      }
    }
  }
}
