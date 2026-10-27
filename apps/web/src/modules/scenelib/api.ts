import type { Scene, SceneLibraryEntry } from '@vtt/shared';
import { api, ApiError } from '../../core/api';
import { tr } from '../../core/i18n';

/** Copia la escena en la misma partida, justo debajo (sin los tokens de los jugadores). */
export const duplicateScene = (sceneId: string) => api.post<{ scene: Scene }>(`/scenes/${sceneId}/duplicate`).then((r) => r.scene);

/** Guarda la escena en tu biblioteca para usarla en cualquiera de tus partidas. */
export const saveToLibrary = (sceneId: string, name: string) => api.post<{ entry: SceneLibraryEntry }>(`/scenes/${sceneId}/library`, { name }).then((r) => r.entry);

export const listLibrary = () => api.get<{ entries: SceneLibraryEntry[] }>('/scene-library').then((r) => r.entries);
export const renameLibraryEntry = (id: string, name: string) => api.patch(`/scene-library/${id}`, { name });
export const removeLibraryEntry = (id: string) => api.delete(`/scene-library/${id}`);
export const placeLibraryEntry = (campaignId: string, id: string) => api.post<{ scene: Scene }>(`/campaigns/${campaignId}/scene-library/${id}`).then((r) => r.scene);

/** Enlace para descargar la escena como archivo. */
export const exportSceneUrl = (sceneId: string) => `/api/scenes/${sceneId}/export`;

/** Archivos que se pueden importar: escenas exportadas y mapas Universal VTT (Dungeondraft, Dungeon Alchemist…). */
export const IMPORT_ACCEPT = '.gz,.json,.dd2vtt,.uvtt,.df2vtt,application/gzip,application/json';

/** Sube un archivo de escena (o un mapa de Dungeondraft) y la crea en la partida. */
export async function importSceneFile(campaignId: string, file: File): Promise<Scene> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/campaigns/${campaignId}/scenes/import`, { method: 'POST', body: form, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? (res.status === 413 ? tr('El archivo es demasiado grande') : tr('No se pudo importar')));
  return data.scene;
}

/** Tamaño legible (KB o MB). */
export const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
