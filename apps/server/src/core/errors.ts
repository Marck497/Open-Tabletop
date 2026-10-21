/** Error de dominio con código HTTP; el manejador global lo convierte en respuesta JSON. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new AppError(400, msg);
export const unauthorized = (msg = 'No has iniciado sesión') => new AppError(401, msg);
export const forbidden = (msg = 'No tienes permiso') => new AppError(403, msg);
export const notFound = (msg = 'No encontrado') => new AppError(404, msg);
export const conflict = (msg: string) => new AppError(409, msg);
