import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** Lo más que puede ocupar un archivo al descomprimirlo: un archivo trucado no puede llenar la memoria. */
const MAX_UNZIPPED_BYTES = 500 * 1024 * 1024;
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, max, sql } from 'drizzle-orm';
import {
  tr,
  looksLikeUvtt,
  MAX_LIBRARY_ENTRIES,
  SCENE_PACKAGE_FORMAT,
  SCENE_PACKAGE_VERSION,
  scenePackageSchema,
  type Scene,
  type SceneLibraryEntry,
  type ScenePackage,
  type ScenePackageInput,
  uvttToScenePackage,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, notFound } from '../../core/errors.js';
import { assets, boardItems, sceneLibrary, scenes } from '../../db/schema.js';
import { createAssetService, MAX_ASSET_BYTES } from '../assets/service.js';
import { createCampaignService } from '../campaigns/service.js';

type SceneRow = typeof scenes.$inferSelect;
type ItemRow = typeof boardItems.$inferSelect;

const toScene = ({ createdAt: _c, ...s }: SceneRow): Scene => s;
/** Los tokens de los jugadores (y sus dibujos) no se copian: son suyos y de esta partida. */
const isPlayerStuff = (i: ItemRow) => i.ownerIds.length > 0;

/** Nombre de archivo seguro a partir del nombre de la escena. */
export const safeFileName = (name: string, fallback: string) =>
  name
    .normalize('NFD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || fallback;

/** Duplicar escenas, exportarlas a un archivo, importarlas y la biblioteca de escenas de cada usuario. */
export function createSceneLibraryService(ctx: AppContext) {
  const { db, config } = ctx;
  const campaignsSvc = createCampaignService(ctx);
  const assetsSvc = createAssetService(ctx);
  const uploadsDir = path.join(config.dataDir, 'uploads');

  function gmSceneRow(sceneId: string, userId: string): SceneRow {
    const row = db.select().from(scenes).where(eq(scenes.id, sceneId)).get();
    if (!row || !campaignsSvc.getRole(row.campaignId, userId)) throw notFound('Escena no encontrada');
    campaignsSvc.requireGm(row.campaignId, userId);
    return row;
  }

  const itemsOf = (sceneId: string) => db.select().from(boardItems).where(eq(boardItems.sceneId, sceneId)).orderBy(asc(boardItems.z)).all();

  /** Hace hueco justo detrás de `after` en la lista de escenas y devuelve el orden que le toca a la nueva. */
  function slotAfter(campaignId: string, after: number): number {
    db.update(scenes)
      .set({ sortOrder: sql`${scenes.sortOrder} + 1` })
      .where(and(eq(scenes.campaignId, campaignId), gt(scenes.sortOrder, after)))
      .run();
    return after + 1;
  }

  function nextOrder(campaignId: string): number {
    return (db.select({ m: max(scenes.sortOrder) }).from(scenes).where(eq(scenes.campaignId, campaignId)).get()?.m ?? -1) + 1;
  }

  // ---------- Duplicar ----------

  /** Copia de una escena en la misma partida, justo debajo de la original (sin los tokens de los jugadores). */
  function duplicate(sceneId: string, userId: string): Scene {
    const src = gmSceneRow(sceneId, userId);
    const id = randomUUID();
    db.transaction((tx) => {
      const { id: _i, createdAt: _c, sortOrder, name, explored: _e, ...rest } = src;
      const order = slotAfter(src.campaignId, sortOrder);
      tx.insert(scenes)
        .values({ ...rest, id, name: tr('{name} (copia)', { name }).slice(0, 80), sortOrder: order, explored: '' })
        .run();
      for (const { id: _iid, createdAt: _ic, sceneId: _s, ...item } of itemsOf(src.id).filter((i) => !isPlayerStuff(i))) {
        tx.insert(boardItems)
          .values({ ...item, id: randomUUID(), sceneId: id })
          .run();
      }
    });
    return toScene(db.select().from(scenes).where(eq(scenes.id, id)).get()!);
  }

  // ---------- Empaquetar y desempaquetar ----------

  /** La escena con todo lo necesario para recrearla en otra partida (imágenes incluidas). */
  function pack(sceneId: string, userId: string): { row: SceneRow; pkg: ScenePackageInput } {
    const row = gmSceneRow(sceneId, userId);
    const items = itemsOf(sceneId).filter((i) => !isPlayerStuff(i));
    const assetIds = [...new Set(items.map((i) => i.assetId).filter((a): a is string => !!a))];
    const files = assetIds.flatMap((assetId) => {
      const a = db.select().from(assets).where(eq(assets.id, assetId)).get();
      const file = a && path.join(uploadsDir, a.path);
      return a && file && fs.existsSync(file) ? [{ id: a.id, name: a.name, mime: a.mime, data: fs.readFileSync(file).toString('base64') }] : [];
    });
    const kept = new Set(files.map((f) => f.id));
    const pkg: ScenePackageInput = {
      format: SCENE_PACKAGE_FORMAT,
      version: SCENE_PACKAGE_VERSION,
      exportedAt: new Date().toISOString(),
      scene: {
        name: row.name,
        widthCells: row.widthCells,
        heightCells: row.heightCells,
        gridSize: row.gridSize,
        gridVisible: row.gridVisible,
        gridColor: row.gridColor,
        backgroundColor: row.backgroundColor,
        cellDistance: row.cellDistance,
        distanceUnit: row.distanceUnit,
        diagonalRule: row.diagonalRule,
        vision: row.vision,
        visionRange: row.visionRange,
        exploration: row.exploration,
        lighting: row.lighting,
        fog: row.fog,
        walls: row.walls,
        terrain: row.terrain,
      },
      items: items.map(({ id: _i, createdAt: _c, sceneId: _s, ...i }) => ({
        ...i,
        assetId: i.assetId && kept.has(i.assetId) ? i.assetId : null,
        characterId: null,
        ownerIds: [],
        ai: i.ai ?? null,
        drawing: i.drawing ?? null,
        light: i.light ?? null,
      })),
      assets: files,
    };
    return { row, pkg };
  }

  /**
   * Lee un archivo de escena (con o sin gzip) y lo valida. También acepta mapas Universal VTT
   * (.dd2vtt de Dungeondraft, .uvtt…), que se convierten; `name` es el nombre que tendrá entonces la escena.
   */
  function parse(file: Buffer, name = tr('Mapa importado')): ScenePackage {
    let text: string;
    try {
      text = (file[0] === 0x1f && file[1] === 0x8b ? zlib.gunzipSync(file, { maxOutputLength: MAX_UNZIPPED_BYTES }) : file).toString('utf8');
    } catch {
      throw badRequest('El archivo está dañado');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw badRequest('No es un archivo de escena ni un mapa de Dungeondraft');
    }
    if (looksLikeUvtt(json)) return validate(fromUvtt(json, name));
    return validate(json);
  }

  function fromUvtt(json: unknown, name: string): ScenePackageInput {
    let pkg: ScenePackageInput;
    try {
      pkg = uvttToScenePackage(json, name);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    // La imagen tiene que caber como archivo de la partida; si no, mejor avisar que crear un mapa sin fondo.
    const bytes = Math.floor(((pkg.assets?.[0]?.data.length ?? 0) * 3) / 4);
    if (bytes > MAX_ASSET_BYTES) {
      throw badRequest(
        `La imagen del mapa pesa ${(bytes / 1024 / 1024).toFixed(0)} MB y el máximo es ${MAX_ASSET_BYTES / 1024 / 1024} MB. Expórtalo con menos píxeles por casilla (por ejemplo 100) o en WEBP.`,
      );
    }
    return pkg;
  }

  function validate(json: unknown): ScenePackage {
    const parsed = scenePackageSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw badRequest(`Escena no válida${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}`);
    }
    return parsed.data;
  }

  /** Crea en la partida una escena nueva a partir del paquete (al final de la lista). */
  function unpack(campaignId: string, userId: string, pkg: ScenePackage, name?: string): Scene {
    campaignsSvc.requireGm(campaignId, userId);
    // Primero las imágenes (se guardan como archivos de esta partida).
    const ids = new Map<string, string>();
    for (const a of pkg.assets) {
      try {
        ids.set(a.id, assetsSvc.save(campaignId, userId, { filename: a.name, mimetype: a.mime, data: Buffer.from(a.data, 'base64') }).id);
      } catch {
        // Una imagen que no vale no impide crear la escena: ese elemento se queda sin imagen.
      }
    }
    const { fog, walls, terrain, ...s } = pkg.scene;
    const w = s.widthCells ?? 30;
    const h = s.heightCells ?? 20;
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(scenes)
        .values({
          ...s,
          ...(fog ? { fog } : {}),
          walls,
          terrain: terrain.length === w * h ? terrain : '',
          name: (name ?? s.name).slice(0, 80),
          id,
          campaignId,
          folderId: null,
          sortOrder: nextOrder(campaignId),
        })
        .run();
      pkg.items.forEach((i, n) => {
        tx.insert(boardItems)
          .values({ ...i, id: randomUUID(), sceneId: id, z: i.z ?? n, assetId: i.assetId ? (ids.get(i.assetId) ?? null) : null, characterId: null, ownerIds: [] })
          .run();
      });
    });
    return toScene(db.select().from(scenes).where(eq(scenes.id, id)).get()!);
  }

  // ---------- Exportar e importar archivos ----------

  function exportScene(sceneId: string, userId: string): { filename: string; data: Buffer } {
    const { row, pkg } = pack(sceneId, userId);
    return { filename: `${safeFileName(row.name, 'escena')}.vtt-escena.json.gz`, data: zlib.gzipSync(JSON.stringify(pkg)) };
  }

  /** `filename` da nombre a la escena si es un mapa de Dungeondraft (los archivos de escena ya traen el suyo). */
  function importScene(campaignId: string, userId: string, file: Buffer, filename = ''): Scene {
    campaignsSvc.requireGm(campaignId, userId);
    const name = filename.replace(/\.(dd2vtt|uvtt|df2vtt|json|gz)$/gi, '').replace(/[_-]+/g, ' ').trim();
    return unpack(campaignId, userId, parse(file, name || undefined));
  }

  // ---------- Biblioteca ----------

  const toEntry = (r: Omit<typeof sceneLibrary.$inferSelect, 'data' | 'userId'> & { size: number }): SceneLibraryEntry => ({
    id: r.id,
    name: r.name,
    widthCells: r.widthCells,
    heightCells: r.heightCells,
    items: r.itemCount,
    size: r.size,
    createdAt: r.createdAt,
  });

  const entryColumns = {
    id: sceneLibrary.id,
    name: sceneLibrary.name,
    widthCells: sceneLibrary.widthCells,
    heightCells: sceneLibrary.heightCells,
    itemCount: sceneLibrary.itemCount,
    createdAt: sceneLibrary.createdAt,
    size: sql<number>`length(${sceneLibrary.data})`,
  };

  function listLibrary(userId: string): SceneLibraryEntry[] {
    return db.select(entryColumns).from(sceneLibrary).where(eq(sceneLibrary.userId, userId)).orderBy(desc(sceneLibrary.createdAt)).all().map(toEntry);
  }

  function saveToLibrary(sceneId: string, userId: string, name?: string): SceneLibraryEntry {
    const count = db.select({ n: sql<number>`count(*)` }).from(sceneLibrary).where(eq(sceneLibrary.userId, userId)).get()?.n ?? 0;
    if (count >= MAX_LIBRARY_ENTRIES) throw badRequest(`La biblioteca está llena (máx. ${MAX_LIBRARY_ENTRIES} escenas): borra alguna`);
    const { row, pkg } = pack(sceneId, userId);
    const id = randomUUID();
    db.insert(sceneLibrary)
      .values({
        id,
        userId,
        name: (name ?? row.name).slice(0, 80),
        widthCells: row.widthCells,
        heightCells: row.heightCells,
        itemCount: pkg.items?.length ?? 0,
        data: zlib.gzipSync(JSON.stringify(pkg)),
      })
      .run();
    return toEntry(db.select(entryColumns).from(sceneLibrary).where(eq(sceneLibrary.id, id)).get()!);
  }

  function libraryRow(entryId: string, userId: string) {
    const row = db.select().from(sceneLibrary).where(and(eq(sceneLibrary.id, entryId), eq(sceneLibrary.userId, userId))).get();
    if (!row) throw notFound('Esa escena no está en tu biblioteca');
    return row;
  }

  function renameLibrary(entryId: string, userId: string, name: string): SceneLibraryEntry {
    libraryRow(entryId, userId);
    db.update(sceneLibrary).set({ name: name.slice(0, 80) }).where(eq(sceneLibrary.id, entryId)).run();
    return toEntry(db.select(entryColumns).from(sceneLibrary).where(eq(sceneLibrary.id, entryId)).get()!);
  }

  function removeLibrary(entryId: string, userId: string): void {
    libraryRow(entryId, userId);
    db.delete(sceneLibrary).where(eq(sceneLibrary.id, entryId)).run();
  }

  /** Crea en la partida una escena a partir de una de la biblioteca (con el nombre que tenga en la biblioteca). */
  function useFromLibrary(entryId: string, campaignId: string, userId: string): Scene {
    campaignsSvc.requireGm(campaignId, userId);
    const row = libraryRow(entryId, userId);
    return unpack(campaignId, userId, parse(row.data), row.name);
  }

  /** Para comprobarlo antes de recibir un archivo grande. */
  const assertGm = (campaignId: string, userId: string) => void campaignsSvc.requireGm(campaignId, userId);

  return { assertGm, duplicate, pack, parse, validate, unpack, exportScene, importScene, listLibrary, saveToLibrary, renameLibrary, removeLibrary, useFromLibrary };
}
