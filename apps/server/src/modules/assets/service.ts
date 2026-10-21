import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { imageSize } from 'image-size';
import type { Asset } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, notFound } from '../../core/errors.js';
import { assets } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';

export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const toAsset = (row: typeof assets.$inferSelect): Asset => ({
  id: row.id,
  campaignId: row.campaignId,
  name: row.name,
  mime: row.mime,
  size: row.size,
  width: row.width,
  height: row.height,
  createdAt: row.createdAt,
});

/** Archivos subidos (mapas, imágenes de tokens...). Se guardan en DATA_DIR/uploads/<partida>/. */
export function createAssetService(ctx: AppContext) {
  const { db, config } = ctx;
  const campaigns = createCampaignService(ctx);
  const uploadsDir = path.join(config.dataDir, 'uploads');

  function save(campaignId: string, userId: string, file: { filename: string; mimetype: string; data: Buffer }): Asset {
    campaigns.requireGm(campaignId, userId);
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) throw badRequest('Formato no permitido. Usa PNG, JPG, WEBP, GIF o SVG');
    if (file.data.length > MAX_ASSET_BYTES) throw badRequest('El archivo es demasiado grande (máx. 25 MB)');

    let width: number | null = null;
    let height: number | null = null;
    try {
      const dim = imageSize(file.data);
      width = dim.width ?? null;
      height = dim.height ?? null;
    } catch {
      throw badRequest('No parece una imagen válida');
    }

    const id = randomUUID();
    const rel = path.join(campaignId, `${id}.${ext}`);
    fs.mkdirSync(path.join(uploadsDir, campaignId), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, rel), file.data);
    const row = {
      id,
      campaignId,
      uploaderId: userId,
      name: file.filename.slice(0, 200) || 'imagen',
      mime: file.mimetype,
      size: file.data.length,
      width,
      height,
      path: rel,
    };
    db.insert(assets).values(row).run();
    return toAsset(db.select().from(assets).where(eq(assets.id, id)).get()!);
  }

  function list(campaignId: string, userId: string): Asset[] {
    campaigns.requireGm(campaignId, userId);
    return db.select().from(assets).where(eq(assets.campaignId, campaignId)).orderBy(desc(assets.createdAt)).all().map(toAsset);
  }

  /** Devuelve la ruta del archivo si el usuario es miembro de la partida. */
  function fileFor(assetId: string, userId: string): { absPath: string; mime: string } {
    const row = db.select().from(assets).where(eq(assets.id, assetId)).get();
    if (!row || !campaigns.getRole(row.campaignId, userId)) throw notFound();
    return { absPath: path.join(uploadsDir, row.path), mime: row.mime };
  }

  function remove(assetId: string, userId: string): void {
    const row = db.select().from(assets).where(eq(assets.id, assetId)).get();
    if (!row) throw notFound();
    campaigns.requireGm(row.campaignId, userId);
    db.delete(assets).where(eq(assets.id, assetId)).run();
    fs.rmSync(path.join(uploadsDir, row.path), { force: true });
  }

  return { save, list, fileFor, remove };
}
