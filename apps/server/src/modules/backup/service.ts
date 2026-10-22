import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { BACKUP_FORMAT, BACKUP_VERSION, backupSchema, type BackupInput, type ImportSummary } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { assets, boardItems, campaigns, characters, handouts, jukebox, macros, scenes, sheetTemplates } from '../../db/schema.js';
import { createAssetService } from '../assets/service.js';
import { createCampaignService } from '../campaigns/service.js';

/** Copias de seguridad: exportar una partida a un archivo y restaurarla como partida nueva. */
export function createBackupService(ctx: AppContext) {
  const { db, config } = ctx;
  const campaignsSvc = createCampaignService(ctx);
  const assetsSvc = createAssetService(ctx);
  const uploadsDir = path.join(config.dataDir, 'uploads');

  /** Copia de la partida (JSON con gzip). Con `withFiles`, incluye imágenes y música. */
  function exportCampaign(campaignId: string, userId: string, withFiles: boolean): { filename: string; data: Buffer } {
    campaignsSvc.requireGm(campaignId, userId);
    const c = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()!;
    const sceneRows = db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).orderBy(asc(scenes.sortOrder)).all();
    const sceneIds = new Set(sceneRows.map((s) => s.id));
    const backup: BackupInput = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      campaign: { name: c.name, description: c.description, systemId: c.systemId, activeSceneId: c.activeSceneId },
      template: db.select().from(sheetTemplates).where(eq(sheetTemplates.campaignId, campaignId)).get()?.definition ?? null,
      scenes: sceneRows.map(({ campaignId: _c, createdAt: _t, ...s }) => s),
      items: db
        .select()
        .from(boardItems)
        .all()
        .filter((i) => sceneIds.has(i.sceneId))
        .map(({ createdAt: _t, ...i }) => ({ ...i, ai: i.ai ?? null, drawing: i.drawing ?? null })),
      characters: db
        .select()
        .from(characters)
        .where(eq(characters.campaignId, campaignId))
        .all()
        .map((ch) => ({ id: ch.id, name: ch.name, avatarAssetId: ch.avatarAssetId, visibleToAll: ch.visibleToAll, values: ch.values })),
      handouts: db
        .select()
        .from(handouts)
        .where(eq(handouts.campaignId, campaignId))
        .all()
        .map(({ campaignId: _c, createdAt: _t, updatedAt: _u, sharedWith: _s, ...h }) => h),
      // Las macros privadas de los jugadores son suyas: solo se guardan las compartidas y las del DM.
      macros: db
        .select()
        .from(macros)
        .where(eq(macros.campaignId, campaignId))
        .all()
        .filter((m) => m.shared || m.ownerId === userId)
        .map(({ campaignId: _c, createdAt: _t, ownerId: _o, ...m }) => m),
      jukebox: (db.select().from(jukebox).where(eq(jukebox.campaignId, campaignId)).get()?.tracks ?? []).map(({ id, assetId, name, volume, loop }) => ({
        id,
        assetId,
        name,
        volume,
        loop,
      })),
      assets: db
        .select()
        .from(assets)
        .where(eq(assets.campaignId, campaignId))
        .all()
        .map((a) => {
          const file = path.join(uploadsDir, a.path);
          const data = withFiles && fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : undefined;
          return { id: a.id, name: a.name, mime: a.mime, ...(data ? { data } : {}) };
        }),
    };
    const date = new Date().toISOString().slice(0, 10);
    const safeName = c.name.normalize('NFD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'partida';
    return { filename: `${safeName}-${date}.vtt.json.gz`, data: zlib.gzipSync(JSON.stringify(backup)) };
  }

  /** Lee el archivo (con o sin gzip) y lo valida. */
  function parse(file: Buffer) {
    let text: string;
    try {
      text = (file[0] === 0x1f && file[1] === 0x8b ? zlib.gunzipSync(file) : file).toString('utf8');
    } catch {
      throw badRequest('El archivo está dañado');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw badRequest('No es una copia de seguridad de la mesa');
    }
    const parsed = backupSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw badRequest(`Copia no válida${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}`);
    }
    return parsed.data;
  }

  /** Restaura la copia como una partida nueva en la que el usuario es el DM. */
  function importCampaign(userId: string, file: Buffer): ImportSummary {
    const backup = parse(file);
    const { id: campaignId } = campaignsSvc.create(userId, {
      name: backup.campaign.name,
      description: backup.campaign.description,
      systemId: backup.campaign.systemId,
    });
    try {
      return restore(campaignId, userId, backup);
    } catch (e) {
      // Si algo falla a medias, no se deja una partida rota.
      campaignsSvc.remove(campaignId, userId);
      throw e;
    }
  }

  function restore(campaignId: string, userId: string, backup: ReturnType<typeof parse>): ImportSummary {
    // Ids nuevos para todo: así se puede restaurar varias veces o en el mismo servidor.
    const ids = new Map<string, string>();
    const fresh = (old: string) => {
      const id = randomUUID();
      ids.set(old, id);
      return id;
    };
    const ref = (old: string | null | undefined) => (old ? (ids.get(old) ?? null) : null);

    let skippedAssets = 0;
    for (const a of backup.assets) {
      if (!a.data) {
        skippedAssets++;
        continue;
      }
      try {
        ids.set(a.id, assetsSvc.save(campaignId, userId, { filename: a.name, mimetype: a.mime, data: Buffer.from(a.data, 'base64') }).id);
      } catch {
        skippedAssets++;
      }
    }

    const summary: ImportSummary = { campaignId, scenes: 0, items: 0, characters: 0, handouts: 0, macros: 0, assets: backup.assets.length - skippedAssets, skippedAssets };
    db.transaction((tx) => {
      if (backup.template) {
        tx.insert(sheetTemplates)
          .values({ campaignId, definition: backup.template })
          .onConflictDoUpdate({ target: sheetTemplates.campaignId, set: { definition: backup.template } })
          .run();
      }
      if (backup.scenes.length) {
        // Fuera la escena vacía con la que nace toda partida.
        tx.update(campaigns).set({ activeSceneId: null }).where(eq(campaigns.id, campaignId)).run();
        tx.delete(scenes).where(eq(scenes.campaignId, campaignId)).run();
      }
      for (const { id, ...s } of backup.scenes) {
        const fits = s.terrain.length === (s.widthCells ?? 30) * (s.heightCells ?? 20);
        tx.insert(scenes).values({ ...s, terrain: fits ? s.terrain : '', id: fresh(id), campaignId }).run();
        summary.scenes++;
      }
      for (const { id, ...ch } of backup.characters) {
        tx.insert(characters)
          .values({ id: fresh(id), campaignId, name: ch.name, avatarAssetId: ref(ch.avatarAssetId), visibleToAll: ch.visibleToAll, values: ch.values, controlledBy: [] })
          .run();
        summary.characters++;
      }
      for (const { id, sceneId, ...i } of backup.items) {
        const scene = ref(sceneId);
        if (!scene) continue;
        tx.insert(boardItems)
          .values({ ...i, id: fresh(id), sceneId: scene, z: i.z ?? 0, assetId: ref(i.assetId), characterId: ref(i.characterId), ownerIds: [] })
          .run();
        summary.items++;
      }
      for (const { id, ...h } of backup.handouts) {
        tx.insert(handouts)
          .values({ ...h, id: fresh(id), campaignId, imageAssetId: ref(h.imageAssetId), sharedWith: [] })
          .run();
        summary.handouts++;
      }
      for (const { id, ...m } of backup.macros) {
        tx.insert(macros)
          .values({ ...m, id: fresh(id), campaignId, ownerId: userId, characterId: ref(m.characterId) })
          .run();
        summary.macros++;
      }
      const tracks = backup.jukebox.flatMap((t) => {
        const assetId = ref(t.assetId);
        return assetId ? [{ ...t, id: randomUUID(), assetId, startedAt: null }] : [];
      });
      if (tracks.length) tx.insert(jukebox).values({ campaignId, tracks }).onConflictDoUpdate({ target: jukebox.campaignId, set: { tracks } }).run();
      const active = ref(backup.campaign.activeSceneId) ?? (backup.scenes[0] ? ref(backup.scenes[0].id) : null);
      if (backup.scenes.length) tx.update(campaigns).set({ activeSceneId: active }).where(eq(campaigns.id, campaignId)).run();
    });
    return summary;
  }

  return { exportCampaign, importCampaign, parse };
}
