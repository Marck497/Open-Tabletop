import { formatText, type TextVars } from '@vtt/shared';

/**
 * Error de dominio con código HTTP; el manejador global lo convierte en respuesta JSON.
 * Si lleva datos (`vars`), el texto es una plantilla con huecos `{nombre}`: se envía también
 * tal cual para que la web la traduzca entera antes de rellenarla.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly text: string,
    public readonly vars?: TextVars,
  ) {
    super(formatText(text, vars));
  }

  /** Lo que se manda a la web: el mensaje ya rellenado y, si hay datos, la plantilla para traducirla. */
  toJSON(): { error: string; text?: string; vars?: TextVars } {
    return this.vars ? { error: this.message, text: this.text, vars: this.vars } : { error: this.message };
  }
}

export const badRequest = (msg: string, vars?: TextVars) => new AppError(400, msg, vars);
export const unauthorized = (msg = 'No has iniciado sesión') => new AppError(401, msg);
export const forbidden = (msg = 'No tienes permiso') => new AppError(403, msg);
export const notFound = (msg = 'No encontrado', vars?: TextVars) => new AppError(404, msg, vars);
export const conflict = (msg: string, vars?: TextVars) => new AppError(409, msg, vars);
