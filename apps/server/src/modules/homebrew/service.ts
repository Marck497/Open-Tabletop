import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { createHomebrewSchema, updateHomebrewSchema, type CampaignRole, type CreateHomebrewInput, type HomebrewEntry, type UpdateHomebrewInput } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { forbidden, notFound } from '../../core/errors.js';
import { homebrew } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';

type Row = typeof homebrew.$inferSelect;
const toEntry = ({ createdAt: _c, ...e }: Row): HomebrewEntry => e;

/** El DM las ve todas; cada jugador, las suyas y las que el DM comparte. */
export function canSeeHomebrew(e: HomebrewEntry, role: CampaignRole, userId: string): boolean {
  return role === 'gm' || e.shared || e.ownerId === userId;
}

/** Creaciones de la mesa: hechizos, ataques y objetos. */
export function createHomebrewService(ctx: AppContext) {
  const { db } = ctx;
  const campaigns = createCampaignService(ctx);

  function row(id: string): HomebrewEntry {
    const r = db.select().from(homebrew).where(eq(homebrew.id, id)).get();
    if (!r) throw notFound('Creación no encontrada');
    return toEntry(r);
  }

  /** Para el servidor (botones de la hoja, IA): sin comprobar quién mira. Null si no existe en esa partida. */
  function find(campaignId: string, id: string): HomebrewEntry | null {
    const r = db
      .select()
      .from(homebrew)
      .where(and(eq(homebrew.id, id), eq(homebrew.campaignId, campaignId)))
      .get();
    return r ? toEntry(r) : null;
  }

  /** Una creación que el usuario puede ver (404 si no). */
  function access(id: string, userId: string): { entry: HomebrewEntry; role: CampaignRole } {
    const entry = row(id);
    const role = campaigns.getRole(entry.campaignId, userId);
    if (!role || !canSeeHomebrew(entry, role, userId)) throw notFound('Creación no encontrada');
    return { entry, role };
  }

  function list(campaignId: string, userId: string): HomebrewEntry[] {
    const role = campaigns.requireMember(campaignId, userId);
    return db
      .select()
      .from(homebrew)
      .where(eq(homebrew.campaignId, campaignId))
      .orderBy(asc(homebrew.name))
      .all()
      .map(toEntry)
      .filter((e) => canSeeHomebrew(e, role, userId));
  }

  function create(campaignId: string, userId: string, input: CreateHomebrewInput): HomebrewEntry {
    const role = campaigns.requireMember(campaignId, userId);
    const data = createHomebrewSchema.parse(input);
    if (data.shared && role !== 'gm') throw forbidden('Solo el DM puede compartir creaciones con la mesa');
    const id = randomUUID();
    db.insert(homebrew)
      .values({ id, campaignId, ownerId: userId, ...data })
      .run();
    return row(id);
  }

  /** Cada uno edita las suyas; el DM, todas. */
  function requireEditable(id: string, userId: string): { entry: HomebrewEntry; role: CampaignRole } {
    const found = access(id, userId);
    if (found.entry.ownerId !== userId && found.role !== 'gm') throw forbidden('Esta creación es de otra persona: duplícala para cambiarla');
    return found;
  }

  function update(id: string, userId: string, input: UpdateHomebrewInput): HomebrewEntry {
    const { role } = requireEditable(id, userId);
    const data = updateHomebrewSchema.parse(input);
    if (data.shared && role !== 'gm') throw forbidden('Solo el DM puede compartir creaciones con la mesa');
    db.update(homebrew)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(homebrew.id, id))
      .run();
    return row(id);
  }

  function remove(id: string, userId: string): HomebrewEntry {
    const { entry } = requireEditable(id, userId);
    db.delete(homebrew).where(eq(homebrew.id, id)).run();
    return entry;
  }

  return { find, access, list, create, update, remove };
}

export type HomebrewService = ReturnType<typeof createHomebrewService>;
