/**
 * Contrato de eventos en tiempo real (Socket.IO) entre servidor y cliente.
 * Cada módulo añade aquí sus eventos para que ambos lados compartan los tipos.
 */
import type { BoardItem, CreateItemInput, Fog, Scene, SceneState, UpdateItemInput } from './schemas/board.js';
import type { Character } from './schemas/character.js';
import type { DiceRoll } from './expr.js';

export interface PresenceUser {
  userId: string;
  displayName: string;
}

/** Respuesta estándar de los eventos con acknowledgement. */
export type AckResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T = undefined> = (res: AckResult<T>) => void;

/** Resultado de una tirada hecha en el servidor (nadie puede falsearla). */
export interface RollResult {
  id: string;
  campaignId: string;
  userId: string;
  userName: string;
  characterId: string | null;
  characterName: string | null;
  label: string;
  expression: string;
  total: number;
  rolls: DiceRoll[];
  /** Solo la ven el DM y quien tira. */
  secret: boolean;
  createdAt: string;
}

export interface RollRequest {
  campaignId: string;
  expression: string;
  label?: string;
  /** Si se indica, las referencias @{campo} se buscan en su hoja. */
  characterId?: string | null;
  /** Para tiradas de una fila de tabla (ataques, conjuros...). */
  row?: { listKey: string; rowId: string } | null;
  secret?: boolean;
}

export interface ServerToClientEvents {
  // Partida
  'presence:update': (payload: { campaignId: string; online: PresenceUser[] }) => void;
  'campaign:membersChanged': (payload: { campaignId: string }) => void;
  'campaign:updated': (payload: { campaignId: string }) => void;
  // Escenas
  'scenes:changed': (payload: { campaignId: string }) => void;
  'scene:activeChanged': (payload: { campaignId: string; sceneId: string | null }) => void;
  'scene:updated': (payload: { scene: Scene }) => void;
  'scene:removed': (payload: { sceneId: string }) => void;
  /** Estado completo de la escena (p. ej. tras cambiar la niebla, porque cambia qué se ve). */
  'scene:sync': (payload: SceneState) => void;
  // Elementos del tablero
  'item:upserted': (payload: { sceneId: string; item: BoardItem }) => void;
  'item:removed': (payload: { sceneId: string; id: string }) => void;
  /** Movimiento en curso mientras se arrastra (no se guarda). */
  'item:moving': (payload: { sceneId: string; id: string; x: number; y: number }) => void;
  'fog:updated': (payload: { sceneId: string; fog: Fog }) => void;
  // Hojas
  'template:updated': (payload: { campaignId: string }) => void;
  'character:upserted': (payload: { character: Character }) => void;
  'character:removed': (payload: { campaignId: string; id: string }) => void;
  // Dados
  'roll:result': (payload: RollResult) => void;
}

export interface ClientToServerEvents {
  'campaign:join': (payload: { campaignId: string }, ack: Ack<{ online: PresenceUser[] }>) => void;
  'campaign:leave': (payload: { campaignId: string }) => void;
  /** Abre una escena: se suscribe a sus cambios y recibe su estado. */
  'scene:view': (payload: { sceneId: string }, ack: Ack<SceneState>) => void;
  'item:create': (payload: { sceneId: string; item: CreateItemInput }, ack: Ack<BoardItem>) => void;
  'item:update': (payload: { sceneId: string; id: string; patch: UpdateItemInput }, ack: Ack<BoardItem>) => void;
  'item:delete': (payload: { sceneId: string; id: string }, ack: Ack) => void;
  'item:moving': (payload: { sceneId: string; id: string; x: number; y: number }) => void;
  'fog:set': (payload: { sceneId: string; fog: Fog }, ack: Ack) => void;
  'fog:add': (payload: { sceneId: string; op: Fog['ops'][number] }, ack: Ack) => void;
  'roll': (payload: RollRequest, ack: Ack<RollResult>) => void;
}

/** Nombre de la sala de Socket.IO de una partida. */
export const campaignRoom = (campaignId: string) => `campaign:${campaignId}`;
/** Nombre de la sala de Socket.IO de una escena. */
export const sceneRoom = (sceneId: string) => `scene:${sceneId}`;
