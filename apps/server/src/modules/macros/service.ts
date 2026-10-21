import { randomUUID } from 'node:crypto';
import { and, asc, eq, max, or } from 'drizzle-orm';
import { createMacroSchema, updateMacroSchema, type CreateMacroInput, type Macro, type UpdateMacroInput } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { macros } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';
import { canEditCharacter, createSheetService } from '../sheets/service.js';

type Row = typeof macros.$inferSelect;
const toMacro = ({ createdAt: _c, ...m }: Row): Macro => m;

/** Macros: las de cada jugador y las que el DM comparte con la mesa. */
export function createMacroService(ctx: AppContext) {
  const { db } = ctx;
  const campaigns = createCampaignService(ctx);
  const sheets = createSheetService(ctx);

  function row(id: string): Macro {
    const r = db.select().from(macros).where(eq(macros.id, id)).get();
    if (!r) throw notFound('Macro no encontrada');
    return toMacro(r);
  }

  function list(campaignId: string, userId: string): Macro[] {
    campaigns.requireMember(campaignId, userId);
    return db
      .select()
      .from(macros)
      .where(and(eq(macros.campaignId, campaignId), or(eq(macros.shared, true), eq(macros.ownerId, userId))))
      .orderBy(asc(macros.sortOrder), asc(macros.createdAt))
      .all()
      .map(toMacro);
  }

  /** Solo se puede asociar a un personaje que uno controla (el DM, a cualquiera). */
  function checkCharacter(campaignId: string, userId: string, characterId: string | null | undefined) {
    if (!characterId) return;
    const { character, role } = sheets.access(characterId, userId);
    if (character.campaignId !== campaignId || !canEditCharacter(character, role, userId)) throw badRequest('Personaje no válido');
  }

  function create(campaignId: string, userId: string, input: CreateMacroInput): Macro {
    const role = campaigns.requireMember(campaignId, userId);
    const data = createMacroSchema.parse(input);
    if (data.shared && role !== 'gm') throw forbidden('Solo el DM puede compartir macros con la mesa');
    checkCharacter(campaignId, userId, data.characterId);
    const order = db.select({ m: max(macros.sortOrder) }).from(macros).where(eq(macros.campaignId, campaignId)).get()?.m ?? -1;
    const id = randomUUID();
    db.insert(macros)
      .values({ id, campaignId, ownerId: userId, ...data, sortOrder: data.sortOrder ?? order + 1 })
      .run();
    return row(id);
  }

  /** Cada uno edita las suyas; el DM, también las compartidas. */
  function requireEditable(m: Macro, userId: string) {
    const role = campaigns.getRole(m.campaignId, userId);
    if (!role || (!m.shared && m.ownerId !== userId)) throw notFound('Macro no encontrada');
    if (m.ownerId !== userId && role !== 'gm') throw forbidden('Esta macro es del DM');
    return role;
  }

  function update(id: string, userId: string, input: UpdateMacroInput): Macro {
    const m = row(id);
    const role = requireEditable(m, userId);
    const data = updateMacroSchema.parse(input);
    if (data.shared && role !== 'gm') throw forbidden('Solo el DM puede compartir macros con la mesa');
    checkCharacter(m.campaignId, userId, data.characterId);
    db.update(macros).set(data).where(eq(macros.id, id)).run();
    return row(id);
  }

  function remove(id: string, userId: string): Macro {
    const m = row(id);
    requireEditable(m, userId);
    db.delete(macros).where(eq(macros.id, id)).run();
    return m;
  }

  return { list, create, update, remove };
}
