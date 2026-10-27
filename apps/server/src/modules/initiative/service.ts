import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  tr,
  compareInitiative,
  DEFAULT_AI_SETTINGS,
  evaluate,
  initiativeRollOf,
  type BoardItem,
  type CampaignRole,
  type Character,
  type ChatMessage,
  type InitiativeAction,
  type InitiativeEntry,
  type InitiativeScope,
  type InitiativeState,
} from '@vtt/shared';
import { z } from 'zod';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden } from '../../core/errors.js';
import { boardItems, campaigns, characters, initiative, users } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';
import { createChatService } from '../chat/service.js';
import { secureRng } from '../dice/service.js';
import { createSheetService } from '../sheets/service.js';

const MAX_ENTRIES = 100;

const entrySchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.number(),
  itemId: z.string().nullable().default(null),
  characterId: z.string().nullable().default(null),
  hidden: z.boolean().default(false),
  bonus: z.number().nullable().optional(),
  die: z.number().nullable().optional(),
});

const sortDesc = (e: InitiativeEntry[]) => [...e].sort(compareInitiative);

/** Resultado de una tirada automática, para el chat. */
interface AutoRoll {
  name: string;
  value: number;
  die: number | null;
  bonus: number;
  hidden: boolean;
}

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
  const sheets = createSheetService(ctx);
  const chat = createChatService(ctx);

  function load(campaignId: string): InitiativeState {
    const row = db.select().from(initiative).where(eq(initiative.campaignId, campaignId)).get();
    return row ?? { campaignId, entries: [], turn: 0, round: 1, active: false, ai: DEFAULT_AI_SETTINGS };
  }

  function save(state: InitiativeState): InitiativeState {
    const turn = state.entries.length ? Math.min(Math.max(0, state.turn), state.entries.length - 1) : 0;
    const next = { ...state, turn };
    db.insert(initiative)
      .values(next)
      .onConflictDoUpdate({ target: initiative.campaignId, set: { entries: next.entries, turn: next.turn, round: next.round, active: next.active, ai: next.ai } })
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
        return step(state, action.type === 'next' ? 1 : -1);
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
        return save({ ...state, entries: [], turn: 0, round: 1, active: false });
      case 'aiSettings': {
        const settings = z.object({ auto: z.boolean(), applyDamage: z.boolean() }).partial().parse(action.settings);
        return save({ ...state, ai: { ...state.ai, ...settings } });
      }
    }
    return state;
  }

  function step(state: InitiativeState, dir: 1 | -1): InitiativeState {
    if (!state.entries.length) return state;
    let turn = state.turn + dir;
    let round = state.round;
    if (turn >= state.entries.length) [turn, round] = [0, round + 1];
    if (turn < 0) [turn, round] = [state.entries.length - 1, Math.max(1, round - 1)];
    return save({ ...state, turn, round, active: true });
  }

  /** Pasa al siguiente turno sin comprobar permisos (lo usa la IA al acabar su turno). */
  function advance(campaignId: string): InitiativeState {
    return step(load(campaignId), 1);
  }

  /** Mantiene el turno actual al insertar una entrada en su sitio por valor. */
  function insertSorted(state: InitiativeState, entry: InitiativeEntry): InitiativeEntry[] {
    const entries = [...state.entries];
    const at = entries.findIndex((e) => compareInitiative(entry, e) < 0);
    entries.splice(at < 0 ? entries.length : at, 0, entry);
    return entries;
  }

  /** Tirada de iniciativa desde una hoja: añade o actualiza la entrada de ese personaje. */
  function fromRoll(p: { campaignId: string; characterId: string | null; name: string; value: number }): InitiativeState {
    const state = load(p.campaignId);
    const existing = p.characterId ? state.entries.find((e) => e.characterId === p.characterId) : undefined;
    if (existing) {
      const current = state.entries[state.turn];
      const updated = state.entries.map((e) => (e === existing ? { ...e, value: p.value, bonus: bonusOf(p.campaignId, p.characterId), die: null } : e));
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
      bonus: bonusOf(p.campaignId, p.characterId),
      die: null,
    };
    const entries = insertSorted(state, entry);
    const current = state.entries[state.turn];
    return save({ ...state, entries, turn: current ? entries.indexOf(current) : 0 });
  }

  function ownsCharacter(campaignId: string, userId: string, characterId: string) {
    const r = ctx.db.query.characters.findFirst({ where: (c, { eq: e }) => e(c.id, characterId), columns: { controlledBy: true, campaignId: true } }).sync();
    return r?.campaignId === campaignId && r.controlledBy.includes(userId);
  }

  function characterRow(characterId: string | null): Character | null {
    if (!characterId) return null;
    const r = db.select().from(characters).where(eq(characters.id, characterId)).get();
    return r ? ({ ...r } as unknown as Character) : null;
  }

  function bonusOf(campaignId: string, characterId: string | null): number | null {
    const ch = characterRow(characterId);
    return ch ? initiativeRollOf(sheets.getTemplate(campaignId), ch.values).bonus : null;
  }

  /**
   * Tirada automática: a cada token de la escena activa (según `scope`) se le tira la
   * iniciativa de su hoja (1d20 + bono; sin hoja, 1d20), se actualiza o añade su entrada
   * y se ordena todo. Los jugadores, con `mine`, solo pueden tirar la de sus personajes.
   */
  function rollAuto(campaignId: string, userId: string, scope: InitiativeScope | 'mine'): { state: InitiativeState; messages: ChatMessage[] } {
    const role = campaignsSvc.requireMember(campaignId, userId);
    if (scope !== 'mine' && role !== 'gm') throw forbidden('Solo el DM gestiona la iniciativa');
    const sceneId = db.select({ s: campaigns.activeSceneId }).from(campaigns).where(eq(campaigns.id, campaignId)).get()?.s;
    if (!sceneId) throw badRequest('No hay ninguna escena abierta');
    const state = load(campaignId);
    const template = sheets.getTemplate(campaignId);
    const items = db.select().from(boardItems).where(eq(boardItems.sceneId, sceneId)).all() as unknown as BoardItem[];

    const entryFor = (item: BoardItem) =>
      state.entries.find((e) => e.itemId === item.id) ?? (item.characterId ? state.entries.find((e) => e.characterId === item.characterId) : undefined);
    const isPlayers = (item: BoardItem, ch: Character | null) => item.ownerIds.length > 0 || (ch?.controlledBy.length ?? 0) > 0;
    const seen = new Set<string>();
    const targets = items.filter((item) => {
      if (item.layer === 'map' || item.drawing) return false;
      // Un personaje con varios tokens tira una sola vez.
      if (item.characterId && seen.has(item.characterId)) return false;
      const ch = characterRow(item.characterId);
      const ok =
        scope === 'all' ||
        (scope === 'npcs' && !isPlayers(item, ch)) ||
        (scope === 'players' && isPlayers(item, ch)) ||
        (scope === 'missing' && !entryFor(item)) ||
        (scope === 'mine' && (item.ownerIds.includes(userId) || !!ch?.controlledBy.includes(userId)));
      if (ok && item.characterId) seen.add(item.characterId);
      return ok;
    });
    if (!targets.length) throw badRequest(scope === 'mine' ? 'No tienes ningún token en la escena' : 'No hay tokens a los que tirar');
    if (state.entries.length + targets.filter((t) => !entryFor(t)).length > MAX_ENTRIES) throw badRequest('Demasiadas entradas');

    const results: AutoRoll[] = [];
    let entries = [...state.entries];
    for (const item of targets) {
      const ch = characterRow(item.characterId);
      const { expression, bonus, resolve } = initiativeRollOf(template, ch?.values ?? null);
      let total: number;
      let die: number | null = null;
      try {
        const r = evaluate(expression, { resolve, rng: secureRng });
        total = r.value;
        const d20 = r.rolls.find((x) => x.sides === 20);
        die = d20 ? (d20.results[d20.kept[0]!] ?? null) : null;
      } catch {
        // Fórmula de la plantilla rota: al menos un d20 más el bono.
        die = Math.floor(secureRng() * 20) + 1;
        total = die + bonus;
      }
      const name = item.name || ch?.name || tr('Token');
      const hidden = item.layer === 'gm';
      const existing = entryFor(item);
      if (existing) {
        entries = entries.map((e) => (e === existing ? { ...e, value: total, bonus, die, itemId: e.itemId ?? item.id } : e));
      } else {
        entries.push({ id: randomUUID(), name, value: total, itemId: item.id, characterId: item.characterId, hidden, bonus, die });
      }
      results.push({ name: existing?.name ?? name, value: total, die, bonus, hidden: existing?.hidden ?? hidden });
    }

    const current = state.entries[state.turn];
    const sorted = sortDesc(entries);
    const next = save({ ...state, entries: sorted, turn: current ? Math.max(0, sorted.findIndex((e) => e.id === current.id)) : 0 });
    return { state: next, messages: announce(campaignId, userId, results) };
  }

  /** Resumen de las tiradas en el chat (las de los ocultos, en secreto para el DM). */
  function announce(campaignId: string, userId: string, results: AutoRoll[]): ChatMessage[] {
    const user = db.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).get();
    const fmt = (r: AutoRoll) => `${r.name} ${r.value}${r.die !== null ? ` (${r.die}${r.bonus ? ` ${r.bonus > 0 ? '+' : '−'} ${Math.abs(r.bonus)}` : ''})` : ''}`;
    const sorted = [...results].sort((a, b) => b.value - a.value || b.bonus - a.bonus);
    const out: ChatMessage[] = [];
    for (const secret of [false, true]) {
      const list = sorted.filter((r) => r.hidden === secret);
      if (!list.length) continue;
      out.push(
        chat.insert({
          campaignId,
          userId,
          userName: user?.name ?? 'DM',
          characterId: null,
          characterName: null,
          kind: 'system',
          text: tr('🎲 Iniciativa{0}: {1}', { '0': secret ? tr(' (ocultos)') : '', '1': list.map(fmt).join(' · ') }),
          roll: null,
          whisperTo: null,
          secret,
        }),
      );
    }
    return out;
  }

  return { get, load, apply, advance, fromRoll, rollAuto };
}
