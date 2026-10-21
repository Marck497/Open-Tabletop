import type { RollRequest } from '@vtt/shared';
import { emitAck } from '../../core/socket';

/** Pide una tirada al servidor. El resultado llega a todos como mensaje del chat. */
export function roll(req: RollRequest) {
  return emitAck('roll', req).catch((e: Error) => alert(e.message));
}
