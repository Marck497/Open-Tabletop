/**
 * Contrato de eventos en tiempo real (Socket.IO) entre servidor y cliente.
 * Cada módulo añade aquí sus eventos para que ambos lados compartan los tipos.
 */

export interface PresenceUser {
  userId: string;
  displayName: string;
}

/** Respuesta estándar de los eventos con acknowledgement. */
export type Ack<T = undefined> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ServerToClientEvents {
  'presence:update': (payload: { campaignId: string; online: PresenceUser[] }) => void;
  'campaign:membersChanged': (payload: { campaignId: string }) => void;
  'campaign:updated': (payload: { campaignId: string }) => void;
}

export interface ClientToServerEvents {
  'campaign:join': (payload: { campaignId: string }, ack: Ack<{ online: PresenceUser[] }>) => void;
  'campaign:leave': (payload: { campaignId: string }) => void;
}

/** Nombre de la sala de Socket.IO de una partida. */
export const campaignRoom = (campaignId: string) => `campaign:${campaignId}`;
