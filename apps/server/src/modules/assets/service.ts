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
/** Audio para la música y el ambiente. */
const AUDIO_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

/** Comprueba por los primeros bytes que el archivo es de verdad audio (no basta con lo que diga el navegador). */
export function looksLikeAudio(buf: Buffer): boolean {
  const ascii = (start: number, len: number) => buf.subarray(start, start + len).toString('latin1');
  if (buf.length < 12) return false;
  return (
    ascii(0, 3) === 'ID3' || // mp3 con etiquetas
    (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) || // trama mp3 / aac
    ascii(0, 4) === 'OggS' ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') ||
    ascii(0, 4) === 'fLaC' ||
    ascii(4, 4) === 'ftyp' || // mp4 / m4a
    buf.readUInt32BE(0) === 0x1a45dfa3 // webm
  );
}

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
    const audioExt = AUDIO_MIME[file.mimetype];
    const ext = ALLOWED_MIME[file.mimetype] ?? audioExt;
    if (!ext) throw badRequest('Formato no permitido. Usa PNG, JPG, WEBP, GIF o SVG (imágenes) o MP3, OGG, WAV, M4A, FLAC (audio)');
    if (file.data.length > MAX_ASSET_BYTES) throw badRequest('El archivo es demasiado grande (máx. 25 MB)');

    let width: number | null = null;
    let height: number | null = null;
    if (audioExt) {
      if (!looksLikeAudio(file.data)) throw badRequest('No parece un archivo de audio válido');
    } else {
      try {
        const dim = imageSize(file.data);
        width = dim.width ?? null;
        height = dim.height ?? null;
      } catch {
        throw badRequest('No parece una imagen válida');
      }
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
  function fileFor(assetId: string, userId: string): { absPath: string; mime: string; size: number } {
    const row = db.select().from(assets).where(eq(assets.id, assetId)).get();
    if (!row || !campaigns.getRole(row.campaignId, userId)) throw notFound();
    return { absPath: path.join(uploadsDir, row.path), mime: row.mime, size: row.size };
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
