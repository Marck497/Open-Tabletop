import { randomUUID } from 'node:crypto';
import { asc, eq, max } from 'drizzle-orm';
import { createHandoutSchema, updateHandoutSchema, type CampaignRole, type CreateHandoutInput, type Handout, type UpdateHandoutInput } from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, notFound } from '../../core/errors.js';
import { assets, handouts } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';

type Row = typeof handouts.$inferSelect;
const toHandout = ({ createdAt: _c, ...h }: Row): Handout => h;

export function canSeeHandout(h: Handout, role: CampaignRole, userId: string): boolean {
  return role === 'gm' || h.visibleToAll || h.sharedWith.includes(userId);
}

/** Lo que recibe cada uno: las notas del DM no salen del servidor si no eres DM. */
export function handoutFor(h: Handout, role: CampaignRole): Handout {
  return role === 'gm' ? h : { ...h, gmNotes: '' };
}

/** Diario de la partida: documentos del DM que se comparten con los jugadores. */
export function createJournalService(ctx: AppContext) {
  const { db } = ctx;
  const campaigns = createCampaignService(ctx);

  function row(id: string): Handout {
    const r = db.select().from(handouts).where(eq(handouts.id, id)).get();
    if (!r) throw notFound('Documento no encontrado');
    return toHandout(r);
  }

  /** Comprueba que puede verlo (a quien no puede se le responde 404, como si no existiera). */
  function access(id: string, userId: string): { handout: Handout; role: CampaignRole } {
    const handout = row(id);
    const role = campaigns.getRole(handout.campaignId, userId);
    if (!role || !canSeeHandout(handout, role, userId)) throw notFound('Documento no encontrado');
    return { handout, role };
  }

  function list(campaignId: string, userId: string): Handout[] {
    const role = campaigns.requireMember(campaignId, userId);
    return db
      .select()
      .from(handouts)
      .where(eq(handouts.campaignId, campaignId))
      .orderBy(asc(handouts.sortOrder), asc(handouts.createdAt))
      .all()
      .map(toHandout)
      .filter((h) => canSeeHandout(h, role, userId))
      .map((h) => handoutFor(h, role));
  }

  function checkRefs(campaignId: string, data: { imageAssetId?: string | null; sharedWith?: string[] }) {
    if (data.imageAssetId) {
      const a = db.select({ campaignId: assets.campaignId }).from(assets).where(eq(assets.id, data.imageAssetId)).get();
      if (a?.campaignId !== campaignId) throw badRequest('Imagen no válida');
    }
    return data.sharedWith ? [...new Set(data.sharedWith)].filter((id) => campaigns.getRole(campaignId, id)) : undefined;
  }

  function create(campaignId: string, userId: string, input: CreateHandoutInput): Handout {
    campaigns.requireGm(campaignId, userId);
    const data = createHandoutSchema.parse(input);
    const sharedWith = checkRefs(campaignId, data) ?? [];
    const order = db.select({ m: max(handouts.sortOrder) }).from(handouts).where(eq(handouts.campaignId, campaignId)).get()?.m ?? -1;
    const id = randomUUID();
    db.insert(handouts)
      .values({ id, campaignId, ...data, sharedWith, sortOrder: data.sortOrder ?? order + 1 })
      .run();
    return row(id);
  }

  function update(id: string, userId: string, input: UpdateHandoutInput): { before: Handout; after: Handout } {
    const before = row(id);
    campaigns.requireGm(before.campaignId, userId);
    const data = updateHandoutSchema.parse(input);
    const sharedWith = checkRefs(before.campaignId, data);
    db.update(handouts)
      .set({ ...data, sharedWith, updatedAt: new Date().toISOString() })
      .where(eq(handouts.id, id))
      .run();
    return { before, after: row(id) };
  }

  function remove(id: string, userId: string): Handout {
    const h = row(id);
    campaigns.requireGm(h.campaignId, userId);
    db.delete(handouts).where(eq(handouts.id, id)).run();
    return h;
  }

  return { list, access, create, update, remove, row };
}
