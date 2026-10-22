import { randomUUID } from 'node:crypto';
import { and, eq, max } from 'drizzle-orm';
import { folderCycle, sceneFolderInputSchema, sceneTreeSchema, type SceneFolder } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, notFound } from '../../core/errors.js';
import { sceneFolders, scenes } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';

/** Carpetas de escenas y orden de la lista (solo el DM). */
export function createSceneFolderService(ctx: AppContext) {
  const { db } = ctx;
  const campaignsSvc = createCampaignService(ctx);

  const toFolder = ({ createdAt: _c, ...f }: typeof sceneFolders.$inferSelect): SceneFolder => f;
  const foldersOf = (campaignId: string) => db.select().from(sceneFolders).where(eq(sceneFolders.campaignId, campaignId)).all().map(toFolder);

  function folderOf(folderId: string, userId: string): SceneFolder {
    const row = db.select().from(sceneFolders).where(eq(sceneFolders.id, folderId)).get();
    if (!row) throw notFound('Carpeta no encontrada');
    campaignsSvc.requireGm(row.campaignId, userId);
    return toFolder(row);
  }

  function create(campaignId: string, userId: string, input: unknown): SceneFolder {
    campaignsSvc.requireGm(campaignId, userId);
    const data = sceneFolderInputSchema.parse(input);
    if (data.parentId && !foldersOf(campaignId).some((f) => f.id === data.parentId)) throw notFound('Carpeta no encontrada');
    const order = db.select({ m: max(sceneFolders.sortOrder) }).from(sceneFolders).where(eq(sceneFolders.campaignId, campaignId)).get()?.m ?? -1;
    const id = randomUUID();
    db.insert(sceneFolders).values({ id, campaignId, name: data.name, parentId: data.parentId, sortOrder: order + 1 }).run();
    return folderOf(id, userId);
  }

  function rename(folderId: string, userId: string, input: unknown): SceneFolder {
    folderOf(folderId, userId);
    const { name } = sceneFolderInputSchema.pick({ name: true }).parse(input);
    db.update(sceneFolders).set({ name }).where(eq(sceneFolders.id, folderId)).run();
    return folderOf(folderId, userId);
  }

  /** Borra la carpeta; lo que tenía dentro (escenas y subcarpetas) sube a su carpeta madre. */
  function remove(folderId: string, userId: string): SceneFolder {
    const folder = folderOf(folderId, userId);
    db.transaction((tx) => {
      tx.update(scenes).set({ folderId: folder.parentId }).where(and(eq(scenes.campaignId, folder.campaignId), eq(scenes.folderId, folderId))).run();
      tx.update(sceneFolders).set({ parentId: folder.parentId }).where(and(eq(sceneFolders.campaignId, folder.campaignId), eq(sceneFolders.parentId, folderId))).run();
      tx.delete(sceneFolders).where(eq(sceneFolders.id, folderId)).run();
    });
    return folder;
  }

  /** Mueve y reordena escenas y carpetas (lo que manda la lista al arrastrar). */
  function arrange(campaignId: string, userId: string, input: unknown) {
    campaignsSvc.requireGm(campaignId, userId);
    const tree = sceneTreeSchema.parse(input);
    const folders = foldersOf(campaignId);
    const folderIds = new Set(folders.map((f) => f.id));
    const sceneIds = new Set(db.select({ id: scenes.id }).from(scenes).where(eq(scenes.campaignId, campaignId)).all().map((r) => r.id));
    for (const s of tree.scenes) {
      if (!sceneIds.has(s.id)) throw notFound('Escena no encontrada');
      if (s.folderId && !folderIds.has(s.folderId)) throw notFound('Carpeta no encontrada');
    }
    // Se comprueban los bucles con el árbol ya cambiado.
    const next = folders.map((f) => ({ ...f, ...tree.folders.find((x) => x.id === f.id) }));
    for (const f of tree.folders) {
      if (!folderIds.has(f.id) || (f.parentId && !folderIds.has(f.parentId))) throw notFound('Carpeta no encontrada');
      if (folderCycle(next, f.id, f.parentId)) throw badRequest('Una carpeta no puede ir dentro de sí misma');
    }
    db.transaction((tx) => {
      for (const s of tree.scenes) tx.update(scenes).set({ folderId: s.folderId, sortOrder: s.sortOrder }).where(eq(scenes.id, s.id)).run();
      for (const f of tree.folders) tx.update(sceneFolders).set({ parentId: f.parentId, sortOrder: f.sortOrder }).where(eq(sceneFolders.id, f.id)).run();
    });
  }

  return { foldersOf, create, rename, remove, arrange };
}
