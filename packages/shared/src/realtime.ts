/**
 * Contrato de eventos en tiempo real (Socket.IO) entre servidor y cliente.
 * Cada módulo añade aquí sus eventos para que ambos lados compartan los tipos.
 */
import type { BoardItem, CreateItemInput, Fog, Scene, SceneState, UpdateItemInput } from './schemas/board.js';
import type { Measure } from './schemas/measure.js';
import type { AiSettings } from './schemas/ai.js';
import type { Character } from './schemas/character.js';
import type { Handout } from './schemas/journal.js';
import type { JukeboxAction, JukeboxState } from './schemas/jukebox.js';
import type { ChatMessage, InitiativeEntry, InitiativeState } from './schemas/chat.js';

export interface PresenceUser {
  userId: string;
  displayName: string;
}

/** Respuesta estándar de los eventos con acknowledgement. */
export type AckResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T = undefined> = (res: AckResult<T>) => void;

/** Resumen del turno de un enemigo con IA. */
export interface AiTurnResult {
  itemId: string;
  name: string;
  summary: string;
  /** Casillas que se ha movido. */
  moved: number;
  attacked: boolean;
  hit: boolean | null;
  damage: number | null;
}

/** Quién hizo una medición o un ping. */
export interface PointerAuthor {
  userId: string;
  name: string;
  color: string;
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
  /** Añade el resultado al orden de iniciativa. */
  toInitiative?: boolean;
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
  /** Regla o plantilla de área de otro usuario (null = la ha quitado). */
  'board:measure': (payload: { sceneId: string } & PointerAuthor & { measure: Measure | null }) => void;
  'board:ping': (payload: { sceneId: string } & PointerAuthor & { x: number; y: number; focus: boolean }) => void;
  // Hojas
  'template:updated': (payload: { campaignId: string }) => void;
  'character:upserted': (payload: { character: Character }) => void;
  'character:removed': (payload: { campaignId: string; id: string }) => void;
  // Diario
  'handout:upserted': (payload: { handout: Handout }) => void;
  'handout:removed': (payload: { campaignId: string; id: string }) => void;
  /** El DM enseña un documento a la mesa: se abre en pantalla a quien pueda verlo. */
  'handout:show': (payload: { campaignId: string; id: string }) => void;
  /** Estado de la música; `serverNow` sirve para sincronizar los relojes. */
  'jukebox:updated': (payload: { state: JukeboxState; serverNow: number }) => void;
  /** Han cambiado las macros de la partida (cada uno recarga las que puede ver). */
  'macros:changed': (payload: { campaignId: string }) => void;
  // Chat, tiradas e iniciativa
  'chat:message': (payload: ChatMessage) => void;
  'chat:cleared': (payload: { campaignId: string }) => void;
  'initiative:updated': (payload: InitiativeState) => void;
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
  /** Comparte la medición en curso (null = quitarla). `gmOnly`: solo la ven los DM. */
  'board:measure': (payload: { sceneId: string; measure: Measure | null; gmOnly?: boolean }) => void;
  /** Señala un punto. Con `focus` (solo DM) centra la vista de todos en él. */
  'board:ping': (payload: { sceneId: string; x: number; y: number; focus?: boolean }) => void;
  'roll': (payload: RollRequest, ack: Ack<ChatMessage>) => void;
  'chat:send': (payload: { campaignId: string; text: string; asCharacterId?: string | null }, ack: Ack<ChatMessage>) => void;
  'initiative:get': (payload: { campaignId: string }, ack: Ack<InitiativeState>) => void;
  /** Acciones sobre el orden de iniciativa (las de gestión, solo el DM). */
  'initiative:action': (payload: { campaignId: string } & InitiativeAction, ack: Ack<InitiativeState>) => void;
  'jukebox:get': (payload: { campaignId: string }, ack: Ack<{ state: JukeboxState; serverNow: number }>) => void;
  /** Solo DM: poner, parar y ajustar pistas. */
  'jukebox:action': (payload: { campaignId: string } & JukeboxAction, ack: Ack) => void;
  /** Solo DM: el token del turno actual (o `itemId`) juega su turno con la IA. */
  'ai:act': (payload: { campaignId: string; itemId?: string | null }, ack: Ack<AiTurnResult>) => void;
}

export type InitiativeAction =
  | { type: 'add'; entry: Omit<InitiativeEntry, 'id'> }
  | { type: 'update'; id: string; patch: Partial<Omit<InitiativeEntry, 'id'>> }
  | { type: 'remove'; id: string }
  | { type: 'sort' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'start' }
  | { type: 'end' }
  | { type: 'clear' }
  | { type: 'aiSettings'; settings: Partial<AiSettings> };

/** Nombre de la sala de Socket.IO de una partida. */
export const campaignRoom = (campaignId: string) => `campaign:${campaignId}`;
/** Nombre de la sala de Socket.IO de una escena. */
export const sceneRoom = (sceneId: string) => `scene:${sceneId}`;
