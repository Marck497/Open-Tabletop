import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@vtt/shared';

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
