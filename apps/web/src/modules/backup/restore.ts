import type { ImportSummary } from '@vtt/shared';
import { ApiError } from '../../core/api';

/** Sube una copia de seguridad: se crea una partida nueva en la que eres el DM. */
export async function restoreBackup(file: File): Promise<ImportSummary> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/campaigns/import', { method: 'POST', body: form, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? (res.status === 413 ? 'El archivo es demasiado grande' : 'No se pudo restaurar'));
  return data.summary;
}
