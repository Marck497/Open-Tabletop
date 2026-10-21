import type { Asset } from '@vtt/shared';
import { ApiError } from '../../core/api';

/** Sube una imagen a la partida (solo DM). */
export async function uploadAsset(campaignId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/campaigns/${campaignId}/assets`, { method: 'POST', body: form, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'No se pudo subir');
  return data.asset;
}
