import { z } from 'zod';
import { SCENE_PACKAGE_FORMAT, SCENE_PACKAGE_VERSION, type ScenePackageInput } from '../schemas/scenePackage.js';
import { MAX_WALLS, type WallInput } from '../schemas/walls.js';
import { tr } from '../i18n/index.js';

/**
 * Importar mapas en formato «Universal VTT» (.dd2vtt de Dungeondraft, .uvtt de Dungeon Alchemist,
 * .df2vtt de DungeonFog…): un JSON con la imagen del mapa en base64, su tamaño en casillas, las
 * paredes (líneas que tapan la vista), las puertas y las luces, todo en casillas.
 */

const point = z.object({ x: z.number().finite(), y: z.number().finite() });

export const uvttSchema = z.object({
  format: z.number().optional(),
  resolution: z.object({
    map_origin: point.default({ x: 0, y: 0 }),
    map_size: point,
    pixels_per_grid: z.number().positive().optional(),
  }),
  line_of_sight: z.array(z.array(point)).default([]),
  /** Objetos que tapan la vista (columnas, árboles…), en las versiones nuevas. */
  objects_line_of_sight: z.array(z.array(point)).default([]),
  portals: z
    .array(
      z.object({
        position: point.optional(),
        bounds: z.array(point).min(2),
        closed: z.boolean().default(true),
        freestanding: z.boolean().optional(),
      }),
    )
    .default([]),
  lights: z
    .array(
      z.object({
        position: point,
        /** Alcance en casillas. */
        range: z.number().nonnegative(),
        intensity: z.number().optional(),
        /** Color en hexadecimal ARGB («ffffaa55»). */
        color: z.string().optional(),
        shadows: z.boolean().optional(),
      }),
    )
    .default([]),
  image: z.string().min(1, tr('El archivo no trae la imagen del mapa')),
});
export type Uvtt = z.infer<typeof uvttSchema>;

/** ¿Parece un archivo Universal VTT? (antes de validarlo entero) */
export const looksLikeUvtt = (json: unknown) => !!json && typeof json === 'object' && 'resolution' in json && 'image' in json;

/** Tipo de imagen por sus primeros bytes (en base64). */
export function imageMimeOf(base64: string): string | null {
  let head: string;
  try {
    head = atob(base64.slice(0, 32).replace(/\s/g, ''));
  } catch {
    return null;
  }
  if (head.charCodeAt(0) === 0x89 && head.slice(1, 4) === 'PNG') return 'image/png';
  if (head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8) return 'image/jpeg';
  if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Quita los puntos intermedios que están en línea recta con sus vecinos (menos paredes, mismo dibujo). */
export function simplifyPolyline(points: { x: number; y: number }[], tolerance = 0.01): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  const out = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    if (Math.abs(cross) / len > tolerance) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Color ARGB («ffrrggbb») o RGB a «#rrggbb». */
function colorOf(c: string | undefined): string {
  const hex = (c ?? '').replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`;
  return '#ffb74d';
}

/** Tamaño de casilla de la escena importada (el mismo que el resto de escenas). */
export const IMPORT_GRID_SIZE = 70;
/** Las escenas no pueden pasar de 200 × 200 casillas. */
const MAX_CELLS = 200;

/**
 * Convierte un mapa Universal VTT en una escena lista para crear: la imagen de fondo en la capa Mapa,
 * paredes y puertas (marcadas como ya dibujadas en la imagen, para no pintarlas encima) y cada luz
 * como una luz invisible en la capa del DM (alumbra igual).
 * Activa la visión dinámica si trae paredes; la oscuridad no, porque la imagen ya trae su iluminación.
 */
export function uvttToScenePackage(input: unknown, name: string): ScenePackageInput {
  const parsed = uvttSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(tr('Mapa no válido{0}', { '0': issue ? ` (${issue.path.join('.')}: ${issue.message})` : '' }));
  }
  const map = parsed.data;
  const g = IMPORT_GRID_SIZE;
  const { x: ox, y: oy } = map.resolution.map_origin;
  const w = Math.ceil(map.resolution.map_size.x - 1e-6);
  const h = Math.ceil(map.resolution.map_size.y - 1e-6);
  if (w < 1 || h < 1) throw new Error(tr('El mapa no tiene tamaño'));
  if (w > MAX_CELLS || h > MAX_CELLS) throw new Error(tr('El mapa mide {w} × {h} casillas y el máximo es {MAX_CELLS} × {MAX_CELLS}', { w, h, MAX_CELLS }));
  const mime = imageMimeOf(map.image);
  if (!mime) throw new Error(tr('La imagen del mapa no es PNG, JPG ni WEBP'));
  const px = (p: { x: number; y: number }) => ({ x: (p.x - ox) * g, y: (p.y - oy) * g });

  const walls: WallInput[] = [];
  for (const line of [...map.line_of_sight, ...map.objects_line_of_sight]) {
    const pts = simplifyPolyline(line).map(px);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
      walls.push({ id: `uv${walls.length.toString(36)}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: 'wall', onImage: true });
    }
  }
  for (const p of map.portals) {
    const a = px(p.bounds[0]!);
    const b = px(p.bounds[p.bounds.length - 1]!);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
    walls.push({ id: `uv${walls.length.toString(36)}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: 'door', open: !p.closed, onImage: true });
  }
  if (walls.length > MAX_WALLS) throw new Error(tr('El mapa trae {length} tramos de pared y el máximo es {MAX_WALLS}: simplifica las paredes al exportarlo', { length: walls.length, MAX_WALLS }));

  const cellDistance = 5;
  const lights = map.lights
    .filter((l) => l.range > 0)
    .map((l) => {
      const at = px(l.position);
      // Alcance total en pies: la mitad brillante y la mitad tenue.
      const half = Math.round(((l.range * cellDistance) / 2) * 10) / 10;
      return {
        layer: 'gm' as const,
        x: at.x - g / 4,
        y: at.y - g / 4,
        width: g / 2,
        height: g / 2,
        name: tr('Luz'),
        color: colorOf(l.color),
        light: { bright: half, dim: half, color: colorOf(l.color) },
      };
    });

  return {
    format: SCENE_PACKAGE_FORMAT,
    version: SCENE_PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    scene: {
      name: name.trim().slice(0, 80) || tr('Mapa importado'),
      widthCells: w,
      heightCells: h,
      gridSize: g,
      cellDistance,
      vision: walls.length > 0,
      exploration: true,
      lighting: false,
      walls,
    },
    items: [{ layer: 'map', x: 0, y: 0, width: map.resolution.map_size.x * g, height: map.resolution.map_size.y * g, assetId: 'mapa', name: '' }, ...lights],
    assets: [{ id: 'mapa', name: `${name.trim().slice(0, 80) || 'mapa'}.${mime.split('/')[1]}`, mime, data: map.image }],
  };
}
