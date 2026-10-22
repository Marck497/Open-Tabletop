import { EventEmitter } from 'node:events';
import type { InitiativeState } from '@vtt/shared';

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
  /** Ha empezado el turno de alguien (al empezar el combate o al pasar turno). */
  /** Ha cambiado una hoja (o la plantilla entera, con characterId null): el tablero reenvía la vida de sus tokens. */
  'character:changed': [{ campaignId: string; characterId: string | null }];
  /** Una hoja ha perdido PG (o PG temporales): `damage` es cuánto, y `hp` los PG que le quedan. */
  'character:damaged': [{ campaignId: string; characterId: string; damage: number; hp: number }];
  'initiative:turnStarted': [{ campaignId: string; userId: string; state: InitiativeState }];
}

export class EventBus extends EventEmitter<DomainEvents> {}
