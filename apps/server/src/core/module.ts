import type { FastifyInstance } from 'fastify';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@vtt/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/client.js';
import type { PublicUser } from '@vtt/shared';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface SocketData {
  user: PublicUser;
}

/** Dependencias compartidas que reciben todos los módulos. */
export interface AppContext {
  config: AppConfig;
  db: Db;
  /** Disponible una vez arrancado Socket.IO (no existe en tests sin realtime). */
  io: IoServer | null;
}

/**
 * Un módulo es una pieza funcional autocontenida (auth, partidas, tablero, hojas...).
 * Para añadir una funcionalidad nueva se crea un módulo y se registra en `modules/index.ts`.
 */
export interface ServerModule {
  name: string;
  /** Rutas HTTP. Se montan bajo `/api`. */
  routes?: (app: FastifyInstance, ctx: AppContext) => void | Promise<void>;
  /** Manejadores de eventos para cada socket autenticado. */
  socket?: (socket: IoSocket, ctx: AppContext) => void;
}
