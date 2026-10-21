import { EventEmitter } from 'node:events';

/**
 * Eventos internos entre módulos del servidor. Permiten que un módulo reaccione
 * a lo que pasa en otro sin importarlo directamente (p. ej. crear la primera
 * escena cuando se crea una partida).
 */
export interface DomainEvents {
  'campaign:created': [{ campaignId: string; userId: string }];
  'campaign:deleted': [{ campaignId: string }];
  /** Una tirada marcada como de iniciativa (la recoge el módulo de iniciativa). */
  'initiative:rolled': [{ campaignId: string; userId: string; characterId: string | null; name: string; value: number }];
  'campaign:memberRemoved': [{ campaignId: string; userId: string }];
}

export class EventBus extends EventEmitter<DomainEvents> {}
