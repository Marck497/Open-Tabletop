import type { BoardItem, HpView, AcView, TokenStats } from '../schemas/board.js';
import { allFields, createResolver, type SheetTemplate, type SheetValues } from '../schemas/sheet.js';
import { combatOf } from './index.js';

/** Quién ve la vida de un token: sin elegir, la de los personajes con dueño la ve todo el mundo y la del resto solo el DM. */
export const hpViewOf = (item: Pick<BoardItem, 'hpView' | 'ownerIds'>): HpView => item.hpView ?? (item.ownerIds.length ? 'numbers' : 'gm');
/** Quién ve la CA de un token (misma regla). */
export const acViewOf = (item: Pick<BoardItem, 'acView' | 'ownerIds'>): AcView => item.acView ?? (item.ownerIds.length ? 'all' : 'gm');

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Proporción redondeada al 5 % (para la barra sin números no se filtra el valor exacto). */
const coarse = (r: number) => Math.round(Math.max(0, Math.min(1, r)) * 20) / 20;

/**
 * Vida, PG temporales y CA de un token vinculado a una hoja, tal como los puede ver `viewer`.
 * El DM y los dueños del token lo ven todo; el resto, según lo que haya elegido el DM:
 * nada, solo la barra (proporción aproximada) o los números.
 */
export function tokenStatsFor(item: BoardItem, template: SheetTemplate, values: SheetValues, viewer: { gm: boolean; userId: string }): TokenStats | null {
  const combat = combatOf(template);
  if (!combat) return null;
  const resolve = createResolver(template, values);
  const read = (key: string) => (key ? num(resolve(key)) : null);
  const tempKey = combat.hpTemp || (allFields(template).some((f) => f.key === 'pg_temporales') ? 'pg_temporales' : '');
  const hp = read(combat.hp);
  const hpMax = read(combat.hpMax);
  const hpTemp = read(tempKey);
  const ac = read(combat.ac);
  const full = viewer.gm || item.ownerIds.includes(viewer.userId);
  const hpView = full ? 'numbers' : hpViewOf(item);
  const stats: TokenStats = {};
  if (hp !== null && hpView !== 'gm') {
    if (hpView === 'numbers') Object.assign(stats, { hp, hpMax, hpTemp: hpTemp || null });
    if (hpMax && hpMax > 0) {
      stats.ratio = hpView === 'numbers' ? Math.max(0, Math.min(1, hp / hpMax)) : coarse(hp / hpMax);
      if (hpTemp && hpTemp > 0) stats.tempRatio = hpView === 'numbers' ? Math.min(1, hpTemp / hpMax) : coarse(hpTemp / hpMax);
    }
  }
  if (ac !== null && (full || acViewOf(item) === 'all')) stats.ac = ac;
  return Object.keys(stats).length ? stats : null;
}
