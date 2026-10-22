import type { DiceRoll } from '../expr.js';
import type { AiSettings } from './ai.js';

export type ChatKind = 'text' | 'emote' | 'roll' | 'system';

export interface ChatRoll {
  label: string;
  expression: string;
  total: number;
  rolls: DiceRoll[];
}

export interface ChatMessage {
  id: string;
  campaignId: string;
  userId: string;
  userName: string;
  /** Si habla o tira como un personaje. */
  characterId: string | null;
  characterName: string | null;
  kind: ChatKind;
  text: string;
  roll: ChatRoll | null;
  /** Si no es null, solo lo ven estos usuarios (y quien lo envía). */
  whisperTo: string[] | null;
  /** Tirada secreta para el DM. */
  secret: boolean;
  createdAt: string;
}

export interface InitiativeEntry {
  id: string;
  name: string;
  value: number;
  /** Token del tablero al que corresponde (para resaltarlo). */
  itemId: string | null;
  characterId: string | null;
  /** Oculto a los jugadores (monstruos que aún no han aparecido). */
  hidden: boolean;
  /** Bono de iniciativa de su hoja (desempata) y dado natural, si se tiró automáticamente. */
  bonus?: number | null;
  die?: number | null;
}

/** Orden de iniciativa: mayor total primero; a igualdad, mayor bono (en 5e, la Destreza). */
export function compareInitiative(a: InitiativeEntry, b: InitiativeEntry): number {
  return b.value - a.value || (b.bonus ?? -Infinity) - (a.bonus ?? -Infinity);
}

/** A quién se le tira la iniciativa automáticamente: todos, solo enemigos/PNJ o solo personajes de jugadores. */
export const INITIATIVE_SCOPES = ['all', 'npcs', 'players', 'missing'] as const;
export type InitiativeScope = (typeof INITIATIVE_SCOPES)[number];

export interface InitiativeState {
  campaignId: string;
  entries: InitiativeEntry[];
  /** Índice del turno actual dentro de `entries`. */
  turn: number;
  round: number;
  active: boolean;
  /** Ajustes de la IA de enemigos. */
  ai: AiSettings;
}

export const CHAT_HELP = [
  ['/r 1d20+5 Ataque', 'Tirar dados (lo que va detrás de la tirada es la etiqueta)'],
  ['/gr 1d20', 'Tirada secreta (solo la ves tú y el DM)'],
  ['/w Ana texto', 'Susurrar a alguien (por su nombre visible)'],
  ['/em se esconde', 'Acción en tercera persona'],
] as const;
