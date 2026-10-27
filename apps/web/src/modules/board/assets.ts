import { heavyAsset, type Asset } from '@vtt/shared';
import { useBoard } from './store';
import { ApiError } from '../../core/api';
import { tr } from '../../core/i18n';

/** Sube una imagen a la partida (solo DM). */
export async function uploadAsset(campaignId: string, file: File): Promise<Asset> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/campaigns/${campaignId}/assets`, { method: 'POST', body: form, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? tr('No se pudo subir'));
  // Se sube igual, pero se avisa si va a costar cargarlo en la Pi y en los móviles.
  const why = heavyAsset(data.asset);
  if (why) useBoard.getState().showNotice(tr('⚠ «{name}» pesa mucho ({why}).', { name: data.asset.name, why }));
  return data.asset;
}
