import { and, eq, inArray } from 'drizzle-orm';
import {
  ActionError,
  applyDefenses,
  defensesOf,
  actionsOf,
  allFields,
  combatOf,
  createResolver,
  damagePatch,
  evaluate,
  ExprError,
  formulaValue,
  healPatch,
  rollHomebrew,
  saveOptions,
  slotsOf,
  spendSlot,
  spendUse,
  statusesOf,
  type BoardItem,
  type Character,
  type ChatEffect,
  type ChatMessage,
  type ChatRoll,
  type ChatRollPart,
  type HomebrewEntry,
  type PublicUser,
  type SheetRow,
  type SheetTemplate,
  type SheetValues,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, notFound } from '../../core/errors.js';
import { boardItems, chatMessages } from '../../db/schema.js';
import { createBoardBroadcaster } from '../board/broadcast.js';
import { createBoardService } from '../board/service.js';
import { createCampaignService } from '../campaigns/service.js';
import { createChatService } from '../chat/service.js';
import { secureRng } from '../dice/service.js';
import { broadcastCharacter } from '../sheets/index.js';
import { createSheetService } from '../sheets/service.js';

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const MAX_TARGETS = 50;

export interface UseResult {
  message: ChatMessage;
  /** Cambios en la hoja (espacio gastado, usos, cantidad). */
  patch: SheetValues | null;
  /** Estado que se pone a los tokens del lanzador (p. ej. concentración). */
  selfStatus: string;
}

/**
 * Lo que hacen las creaciones en la mesa: usarlas con una hoja (tiradas en el servidor, gasto de
 * espacios, usos y consumibles) y aplicar su efecto a los tokens (salvaciones, daño, curación, estados).
 */
export function createHomebrewEffects(ctx: AppContext) {
  const { db } = ctx;
  const chat = createChatService(ctx);
  const sheets = createSheetService(ctx);
  const board = createBoardService(ctx);
  const broadcaster = createBoardBroadcaster(ctx, board);
  const campaigns = createCampaignService(ctx);

  /** Usa la creación con la hoja de `character` (los permisos ya están comprobados). */
  function use(
    user: PublicUser,
    character: Character,
    template: SheetTemplate,
    entry: HomebrewEntry,
    opts: { slot?: number; row?: SheetRow; secret?: boolean } = {},
  ): UseResult {
    const d = entry.data;
    const a = actionsOf(template);
    const values = character.values;
    const patch: SheetValues = {};
    const notes: string[] = [];
    const current = () => ({ ...values, ...patch });
    const linked = (list: string) => (Array.isArray(current()[list]) ? (current()[list] as SheetRow[]) : []).filter((r) => r._ref === entry.id);

    try {
      // Espacio de conjuro: si la hoja no lleva espacios (PNJ, monstruos), se lanza sin gastar.
      let castLevel: number | undefined;
      if (entry.kind === 'spell' && d.level > 0) {
        if (slotsOf(template, values).some((s) => s.max > 0)) {
          const spent = spendSlot(template, values, d.level, opts.slot);
          Object.assign(patch, spent.patch);
          castLevel = spent.slot;
          notes.push(`espacio de nivel ${spent.slot}, quedan ${spent.left}/${spent.max}`);
        } else {
          castLevel = Math.max(d.level, opts.slot ?? d.level);
          notes.push(`nivel ${castLevel}`);
        }
      } else if (entry.kind === 'spell') notes.push('truco');

      // Usos: los de su fila de recursos, si la tiene.
      const res = d.uses > 0 && a.resources ? linked(a.resources.list)[0] : undefined;
      if (res) {
        const used = spendUse(template, current(), res._id);
        Object.assign(patch, used.patch);
        notes.push(`quedan ${used.left}/${used.max} usos`);
      }
      // Consumibles: uno menos en el inventario.
      const inv = a.inventory;
      const item = d.consumable && inv ? linked(inv.list)[0] : undefined;
      if (inv && item) {
        const qty = num(item[inv.qty]);
        if (qty <= 0) throw new ActionError(`No te quedan ${entry.name}`);
        const rows = current()[inv.list] as SheetRow[];
        patch[inv.list] = rows.map((r) => (r._id === item._id ? { ...r, [inv.qty]: qty - 1 } : r));
        notes.push(`quedan ${qty - 1}`);
      }

      const r = rollHomebrew(d, { resolve: createResolver(template, values, opts.row), rng: secureRng, castLevel, kind: entry.kind });
      const save = d.save ? saveOptions(template).find((s) => s.value === d.save) : undefined;
      const effect: ChatEffect = {
        entryId: entry.id,
        name: entry.name,
        attack: r.attack ? { total: r.attack.total, natural: r.attack.natural, crit: r.attack.crit } : null,
        save: d.save ? { ability: d.save, label: save?.label ?? d.save, dc: r.dc ?? 10, half: d.saveHalf } : null,
        damage: r.damage,
        damageTypes: r.damageTypes,
        damageParts: r.damageParts,
        heal: r.heal,
        conditions: d.conditions.filter((c) => statusesOf(template).some((s) => s.id === c)),
        area: d.area.shape !== 'none' && d.area.size > 0 ? { shape: d.area.shape, size: d.area.size } : null,
      };
      const verdict = r.attack?.crit ? ' — ¡crítico!' : r.attack?.natural === 1 ? ' — pifia' : '';
      const label = `${entry.name}${notes.length ? ` (${notes.join(', ')})` : ''}${verdict}`;
      let roll: ChatRoll;
      if (r.attack) roll = { label, expression: r.attack.expression, total: r.attack.total, rolls: r.attack.rolls, parts: r.parts, crit: r.attack.crit, effect };
      else if (r.parts.length) {
        const [first, ...rest] = r.parts;
        roll = { ...first!, label: `${label}: ${first!.label.toLowerCase()}`, parts: rest, effect };
      } else roll = { label, expression: '', total: 0, rolls: [], effect };

      const message = chat.insert({
        campaignId: character.campaignId,
        userId: user.id,
        userName: user.displayName,
        characterId: character.id,
        characterName: character.name,
        kind: 'roll',
        text: '',
        roll,
        whisperTo: null,
        secret: opts.secret ?? false,
      });
      return { message, patch: Object.keys(patch).length ? patch : null, selfStatus: d.selfStatus };
    } catch (e) {
      if (e instanceof ActionError) throw badRequest(e.message);
      if (e instanceof ExprError) throw badRequest(`${entry.name}: tirada no válida (${e.message}). Revísala en ⚗ Creaciones.`);
      throw e;
    }
  }

  /** Tokens de las escenas de la partida (los que existan de esa lista). */
  function itemsOf(campaignId: string, ids: string[]): BoardItem[] {
    const scenes = board.sceneIdsOf(campaignId);
    if (!ids.length || !scenes.length) return [];
    const found = db
      .select({ id: boardItems.id, sceneId: boardItems.sceneId })
      .from(boardItems)
      .where(and(inArray(boardItems.id, ids), inArray(boardItems.sceneId, scenes)))
      .all();
    // En el orden pedido (el del resumen del chat), no en el de la base de datos.
    found.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return found.map((f) => board.itemsOf(f.sceneId).items.find((i) => i.id === f.id)!).filter(Boolean);
  }

  async function addStatuses(stale: BoardItem, add: string[]) {
    // Se relee: otro módulo (p. ej. la concentración) puede haberle cambiado los estados entretanto.
    const item = board.itemsOf(stale.sceneId).items.find((i) => i.id === stale.id) ?? stale;
    const statuses = [...new Set([...item.statuses, ...add])].slice(0, 30);
    if (statuses.length === item.statuses.length) return;
    const { scene, before, after } = board.systemUpdate(item.sceneId, item.id, { statuses });
    await broadcaster.itemChanged(scene, before, after);
  }

  /** Marca a los tokens de un personaje con un estado (concentración al lanzar, etc.). */
  async function markCaster(campaignId: string, characterId: string, status: string) {
    const template = sheets.getTemplate(campaignId);
    if (!status || !statusesOf(template).some((s) => s.id === status)) return;
    const scenes = board.sceneIdsOf(campaignId);
    if (!scenes.length) return;
    const ids = db
      .select({ id: boardItems.id })
      .from(boardItems)
      .where(and(eq(boardItems.characterId, characterId), inArray(boardItems.sceneId, scenes)))
      .all()
      .map((r) => r.id);
    for (const item of itemsOf(campaignId, ids)) await addStatuses(item, [status]);
  }

  /**
   * Solo el DM: aplica el efecto de un mensaje a unos tokens. Ataques contra su CA; salvaciones
   * con la hoja de cada uno (mitad o nada al salvar); daño (primero los PG temporales), curación y estados.
   */
  async function apply(user: PublicUser, messageId: string, itemIds: string[]): Promise<ChatMessage> {
    const m = db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).get();
    if (!m) throw notFound('Mensaje no encontrado');
    campaigns.requireGm(m.campaignId, user.id);
    const effect = m.roll?.effect;
    if (!effect) throw badRequest('Ese mensaje no tiene nada que aplicar');
    const items = itemsOf(m.campaignId, [...new Set(itemIds)].slice(0, MAX_TARGETS));
    if (!items.length) throw badRequest('Elige los tokens: selecciona uno o coloca la plantilla de área encima');

    const template = sheets.getTemplate(m.campaignId);
    const combat = combatOf(template);
    const statusDefs = statusesOf(template);
    const saveOpt = effect.save ? saveOptions(template).find((o) => o.value === effect.save!.ability) : undefined;
    const saveField = saveOpt ? allFields(template).find((f) => f.key === saveOpt.key) : undefined;
    const lines: string[] = [];
    const parts: ChatRollPart[] = [];
    let hidden = false;

    for (const item of items) {
      let character: Character | null = null;
      if (item.characterId) {
        try {
          character = sheets.row(item.characterId);
        } catch {
          character = null;
        }
      }
      const name = item.name || character?.name || 'Token';
      if (item.layer === 'gm') hidden = true;
      const resolve = character ? createResolver(template, character.values) : undefined;
      const pieces: string[] = [];

      let hit = true;
      if (effect.attack) {
        const ac = resolve && combat?.ac ? formulaValue(combat.ac, resolve) : null;
        hit = effect.attack.crit || (effect.attack.natural !== 1 && (ac === null || effect.attack.total >= ac));
        pieces.push(`${effect.attack.crit ? '¡crítico!' : hit ? 'impacta' : 'falla'}${ac !== null && !effect.attack.crit ? ` (CA ${ac})` : ''}`);
      }
      let saved = false;
      if (hit && effect.save) {
        const expression = character && saveField ? saveField.roll || `1d20 + @{${saveField.key}}` : '1d20';
        let total = 0;
        let rolls: ChatRollPart['rolls'] = [];
        try {
          const r = evaluate(expression, { resolve, rng: secureRng });
          total = Math.round(r.value);
          rolls = r.rolls;
        } catch {
          const r = evaluate('1d20', { rng: secureRng });
          total = r.value;
          rolls = r.rolls;
        }
        saved = total >= effect.save.dc;
        parts.push({ label: `${name}: salvación de ${effect.save.label} (CD ${effect.save.dc}) ${saved ? '✔ salva' : '✘ falla'}`, expression, total, rolls });
      }

      // Daño por tipos (los mensajes antiguos solo traen el total) con la salvación y luego las defensas.
      const typed = (effect.damageParts ?? [{ type: effect.damageTypes[0] ?? '', amount: effect.damage }]).map((p) => ({
        ...p,
        amount: !hit ? 0 : saved ? (effect.save?.half ? Math.floor(p.amount / 2) : 0) : p.amount,
      }));
      const defended = applyDefenses(typed, defensesOf(template, character?.values ?? null, item.statuses));
      const damage = defended.total;
      const why = defended.notes.length ? ` (${defended.notes.join(', ')})` : '';
      const isPc = !!character?.controlledBy.length;
      if (damage > 0) {
        const p = character ? damagePatch(template, character.values, damage) : null;
        if (character && p) {
          const after = sheets.update(character.id, user.id, { values: p.patch }).after;
          await broadcastCharacter(ctx, character, after);
          character = after;
          pieces.push(`${damage} de daño${why}${isPc ? ` (${p.before} → ${p.after})` : p.after === 0 ? ' (cae a 0)' : ''}`);
        } else pieces.push(`${damage} de daño${why} (sin hoja)`);
      } else if (effect.damage > 0 && hit) pieces.push(`sin daño${why}`);
      if (effect.heal > 0 && hit) {
        const p = character ? healPatch(template, character.values, effect.heal) : null;
        if (character && p) {
          const after = sheets.update(character.id, user.id, { values: p.patch }).after;
          await broadcastCharacter(ctx, character, after);
          character = after;
          pieces.push(`recupera ${p.after - p.before} PG${isPc ? ` (${p.before} → ${p.after})` : ''}`);
        } else pieces.push(`cura ${effect.heal} (sin hoja)`);
      }
      const conditions = hit && !saved ? effect.conditions.filter((c) => statusDefs.some((s) => s.id === c)) : [];
      if (conditions.length) {
        await addStatuses(item, conditions);
        pieces.push(conditions.map((c) => statusDefs.find((s) => s.id === c)!.label.toLowerCase()).join(', '));
      }
      lines.push(`${name}: ${pieces.join(', ') || 'sin efecto'}`);
    }

    const message = chat.insert({
      campaignId: m.campaignId,
      userId: user.id,
      userName: user.displayName,
      characterId: null,
      characterName: null,
      kind: 'roll',
      text: lines.join('\n'),
      roll: { label: `${effect.name}: aplicado a ${items.length} token${items.length > 1 ? 's' : ''}`, expression: '', total: 0, rolls: [], parts },
      whisperTo: null,
      // Si hay tokens ocultos (capa del DM), el resumen solo lo ve el DM.
      secret: hidden || m.secret,
    });
    return message;
  }

  return { use, apply, markCaster };
}
