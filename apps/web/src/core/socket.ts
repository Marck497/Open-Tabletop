import { io, type Socket } from 'socket.io-client';
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@vtt/shared';
import { tr } from './i18n';

export type VttSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: VttSocket | null = null;

/** Conexión única de Socket.IO compartida por toda la app (se autentica con la cookie de sesión). */
export function getSocket(): VttSocket {
  if (!socket) socket = io({ withCredentials: true, autoConnect: true });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

type AckEvents = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [infer P, (res: AckResult<infer R>) => void] ? [P, R] : never;
};
type AckEventName = { [K in keyof AckEvents]: AckEvents[K] extends never ? never : K }[keyof AckEvents];

/** Emite un evento con respuesta y lo convierte en promesa (lanza si el servidor devuelve error). */
export function emitAck<K extends AckEventName>(event: K, payload: AckEvents[K][0]): Promise<AckEvents[K][1]> {
  return new Promise((resolve, reject) => {
    (getSocket().emit as (...args: unknown[]) => void)(event, payload, (res: AckResult<AckEvents[K][1]>) =>
      res.ok ? resolve(res.data) : reject(new Error(res.text ? tr(res.text, res.vars) : tr(res.error))),
    );
  });
}
