import { ZodError } from 'zod';
import type { AckResult } from '@vtt/shared';
import { AppError } from './errors.js';

/** Ejecuta un manejador de socket y responde por el ack con los datos o con el mensaje de error. */
export async function handleAck<T>(ack: ((r: AckResult<T>) => void) | undefined, fn: () => Promise<T> | T) {
  try {
    ack?.({ ok: true, data: await fn() });
  } catch (err) {
    if (err instanceof AppError) return ack?.({ ok: false, ...err.toJSON() });
    if (err instanceof ZodError) return ack?.({ ok: false, error: err.issues[0]?.message ?? 'Datos no válidos' });
    console.error(err);
    ack?.({ ok: false, error: 'Error interno' });
  }
}
