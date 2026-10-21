import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { CampaignRole, InitiativeAction, InitiativeEntry, InitiativeState } from '@vtt/shared';
import { z } from 'zod';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden } from '../../core/errors.js';
import { boardItems, campaigns, initiative } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';

const MAX_ENTRIES = 100;

const entrySchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.number(),
  itemId: z.string().nullable().default(null),
  characterId: z.string().nullable().default(null),
  hidden: z.boolean().default(false),
});

const sortDesc = (e: InitiativeEntry[]) => [...e].sort((a, b) => b.value - a.value);

/** Lo que ve un jugador: sin entradas ocultas (y el turno actual reajustado). */
export function viewFor(state: InitiativeState, role: CampaignRole): InitiativeState {
  if (role === 'gm') return state;
  const current = state.entries[state.turn];
  const entries = state.entries.filter((e) => !e.hidden);
  return { ...state, entries, turn: current && !current.hidden ? entries.indexOf(current) : -1 };
}

/** Orden de iniciativa (turnos de combate) de cada partida. */
export function createInitiativeService(ctx: AppContext) {
  const { db } = ctx;
  const campaignsSvc = createCampaignService(ctx);

  function load(campaignId: string): InitiativeState {
    const row = db.select().from(initiative).where(eq(initiative.campaignId, campaignId)).get();
    return row ?? { campaignId, entries: [], turn: 0, round: 1, active: false };
  }

  function save(state: InitiativeState): InitiativeState {
    const turn = state.entries.length ? Math.min(Math.max(0, state.turn), state.entries.length - 1) : 0;
    const next = { ...state, turn };
    db.insert(initiative)
      .values(next)
      .onConflictDoUpdate({ target: initiative.campaignId, set: { entries: next.entries, turn: next.turn, round: next.round, active: next.active } })
      .run();
    return next;
  }

  function get(campaignId: string, userId: string): { state: InitiativeState; role: CampaignRole } {
    const role = campaignsSvc.requireMember(campaignId, userId);
    return { state: load(campaignId), role };
  }

  /** Token de la escena activa vinculado a un personaje (para resaltarlo en su turno). */
  function tokenOf(campaignId: string, characterId: string | null): string | null {
    if (!characterId) return null;
    const sceneId = db.select({ s: campaigns.activeSceneId }).from(campaigns).where(eq(campaigns.id, campaignId)).get()?.s;
    if (!sceneId) return null;
    return (
      db
        .select({ id: boardItems.id })
        .from(boardItems)
        .where(and(eq(boardItems.sceneId, sceneId), eq(boardItems.characterId, characterId)))
        .get()?.id ?? null
    );
  }

  function apply(campaignId: string, userId: string, action: InitiativeAction): InitiativeState {
    const role = campaignsSvc.requireMember(campaignId, userId);
    const state = load(campaignId);
    const current = state.entries[state.turn];
    const isGm = role === 'gm';

    switch (action.type) {
      case 'next':
      case 'prev': {
        // Un jugador puede pasar turno solo si es el suyo.
        if (!isGm && !(action.type === 'next' && current?.characterId && ownsCharacter(campaignId, userId, current.characterId))) {
          throw forbidden('Solo el DM puede cambiar el turno');
        }
        if (!state.entries.length) return state;
        let turn = state.turn + (action.type === 'next' ? 1 : -1);
        let round = state.round;
        if (turn >= state.entries.length) [turn, round] = [0, round + 1];
        if (turn < 0) [turn, round] = [state.entries.length - 1, Math.max(1, round - 1)];
        return save({ ...state, turn, round, active: true });
      }
      default:
        if (!isGm) throw forbidden('Solo el DM gestiona la iniciativa');
    }

    switch (action.type) {
      case 'add': {
        if (state.entries.length >= MAX_ENTRIES) throw badRequest('Demasiadas entradas');
        const entry = { id: randomUUID(), ...entrySchema.parse(action.entry) };
        return save({ ...state, entries: insertSorted(state, entry) });
      }
      case 'update': {
        const patch = entrySchema.partial().parse(action.patch);
        return save({ ...state, entries: state.entries.map((e) => (e.id === action.id ? { ...e, ...patch } : e)) });
      }
      case 'remove': {
        const idx = state.entries.findIndex((e) => e.id === action.id);
        if (idx < 0) return state;
        const entries = state.entries.filter((e) => e.id !== action.id);
        return save({ ...state, entries, turn: idx < state.turn ? state.turn - 1 : state.turn });
      }
      case 'sort': {
        const entries = sortDesc(state.entries);
        return save({ ...state, entries, turn: current ? entries.indexOf(current) : 0 });
      }
      case 'start':
        return save({ ...state, entries: sortDesc(state.entries), turn: 0, round: 1, active: true });
      case 'end':
        return save({ ...state, active: false });
      case 'clear':
        return save({ campaignId, entries: [], turn: 0, round: 1, active: false });
    }
    return state;
  }

  /** Mantiene el turno actual al insertar una entrada en su sitio por valor. */
  function insertSorted(state: InitiativeState, entry: InitiativeEntry): InitiativeEntry[] {
    const entries = [...state.entries];
    const at = entries.findIndex((e) => e.value < entry.value);
    entries.splice(at < 0 ? entries.length : at, 0, entry);
    return entries;
  }

  /** Tirada de iniciativa desde una hoja: añade o actualiza la entrada de ese personaje. */
  function fromRoll(p: { campaignId: string; characterId: string | null; name: string; value: number }): InitiativeState {
    const state = load(p.campaignId);
    const existing = p.characterId ? state.entries.find((e) => e.characterId === p.characterId) : undefined;
    if (existing) {
      const current = state.entries[state.turn];
      const updated = state.entries.map((e) => (e === existing ? { ...e, value: p.value } : e));
      // Si el combate no ha empezado, se reordena; si ya está en marcha, no se toca el orden.
      const entries = state.active ? updated : sortDesc(updated);
      return save({ ...state, entries, turn: current ? entries.findIndex((e) => e.id === current.id) : 0 });
    }
    const entry: InitiativeEntry = {
      id: randomUUID(),
      name: p.name,
      value: p.value,
      characterId: p.characterId,
      itemId: tokenOf(p.campaignId, p.characterId),
      hidden: false,
    };
    const entries = insertSorted(state, entry);
    const current = state.entries[state.turn];
    return save({ ...state, entries, turn: current ? entries.indexOf(current) : 0 });
  }

  function ownsCharacter(campaignId: string, userId: string, characterId: string) {
    const r = ctx.db.query.characters.findFirst({ where: (c, { eq: e }) => e(c.id, characterId), columns: { controlledBy: true, campaignId: true } }).sync();
    return r?.campaignId === campaignId && r.controlledBy.includes(userId);
  }

  return { get, apply, fromRoll };
}
