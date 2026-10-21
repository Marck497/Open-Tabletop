import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  campaignRoom,
  createCampaignSchema,
  updateCampaignSchema,
  type CampaignDetail,
  type CampaignRole,
  type CampaignSummary,
  type CreateCampaignInput,
  type UpdateCampaignInput,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { campaignMembers, campaigns, users } from '../../db/schema.js';

// Sin caracteres ambiguos (0/O, 1/I/L) para que sea fácil de dictar por voz.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newInviteCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

export function createCampaignService(ctx: AppContext) {
  const { db } = ctx;

  function getRole(campaignId: string, userId: string): CampaignRole | null {
    const row = db
      .select({ role: campaignMembers.role })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
      .get();
    return row?.role ?? null;
  }

  function requireMember(campaignId: string, userId: string): CampaignRole {
    const role = getRole(campaignId, userId);
    if (!role) throw notFound('Partida no encontrada');
    return role;
  }

  function requireGm(campaignId: string, userId: string): void {
    if (requireMember(campaignId, userId) !== 'gm') throw forbidden('Solo el DM puede hacer esto');
  }

  function notify(campaignId: string, event: 'campaign:updated' | 'campaign:membersChanged') {
    ctx.io?.to(campaignRoom(campaignId)).emit(event, { campaignId });
  }

  function listForUser(userId: string): CampaignSummary[] {
    return db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        description: campaigns.description,
        systemId: campaigns.systemId,
        createdAt: campaigns.createdAt,
        role: campaignMembers.role,
      })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
      .where(eq(campaignMembers.userId, userId))
      .orderBy(desc(campaigns.createdAt))
      .all();
  }

  function create(userId: string, input: CreateCampaignInput): CampaignDetail {
    const data = createCampaignSchema.parse(input);
    const id = randomUUID();
    db.transaction((tx) => {
      tx.insert(campaigns).values({ id, ...data, ownerId: userId, inviteCode: newInviteCode() }).run();
      tx.insert(campaignMembers).values({ campaignId: id, userId, role: 'gm' }).run();
    });
    ctx.events.emit('campaign:created', { campaignId: id, userId });
    return get(id, userId);
  }

  function get(campaignId: string, userId: string): CampaignDetail {
    const role = requireMember(campaignId, userId);
    const c = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
    if (!c) throw notFound('Partida no encontrada');
    const members = db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: campaignMembers.role,
        joinedAt: campaignMembers.joinedAt,
      })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(eq(campaignMembers.campaignId, campaignId))
      .orderBy(asc(campaignMembers.joinedAt))
      .all();
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      systemId: c.systemId,
      createdAt: c.createdAt,
      ownerId: c.ownerId,
      activeSceneId: c.activeSceneId,
      role,
      inviteCode: role === 'gm' ? c.inviteCode : undefined,
      members,
    };
  }

  function update(campaignId: string, userId: string, input: UpdateCampaignInput): CampaignDetail {
    requireGm(campaignId, userId);
    const data = updateCampaignSchema.parse(input);
    if (Object.keys(data).length > 0) db.update(campaigns).set(data).where(eq(campaigns.id, campaignId)).run();
    notify(campaignId, 'campaign:updated');
    return get(campaignId, userId);
  }

  function remove(campaignId: string, userId: string): void {
    const c = db.select({ ownerId: campaigns.ownerId }).from(campaigns).where(eq(campaigns.id, campaignId)).get();
    if (!c || !getRole(campaignId, userId)) throw notFound('Partida no encontrada');
    if (c.ownerId !== userId) throw forbidden('Solo quien creó la partida puede borrarla');
    db.delete(campaigns).where(eq(campaigns.id, campaignId)).run();
    ctx.events.emit('campaign:deleted', { campaignId });
    notify(campaignId, 'campaign:updated');
  }

  function joinByInvite(userId: string, inviteCode: string): CampaignSummary {
    const c = db.select().from(campaigns).where(eq(campaigns.inviteCode, inviteCode.toUpperCase())).get();
    if (!c) throw notFound('Código de invitación no válido');
    if (!getRole(c.id, userId)) {
      db.insert(campaignMembers).values({ campaignId: c.id, userId, role: 'player' }).run();
      notify(c.id, 'campaign:membersChanged');
    }
    const summary = listForUser(userId).find((s) => s.id === c.id);
    if (!summary) throw notFound();
    return summary;
  }

  function regenerateInvite(campaignId: string, userId: string): string {
    requireGm(campaignId, userId);
    const code = newInviteCode();
    db.update(campaigns).set({ inviteCode: code }).where(eq(campaigns.id, campaignId)).run();
    return code;
  }

  function setMemberRole(campaignId: string, actorId: string, targetId: string, role: CampaignRole): void {
    requireGm(campaignId, actorId);
    const c = db.select({ ownerId: campaigns.ownerId }).from(campaigns).where(eq(campaigns.id, campaignId)).get();
    if (c?.ownerId === targetId) throw badRequest('No se puede cambiar el rol de quien creó la partida');
    requireMember(campaignId, targetId);
    db.update(campaignMembers)
      .set({ role })
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, targetId)))
      .run();
    notify(campaignId, 'campaign:membersChanged');
  }

  /** Un jugador abandona la partida, o el DM expulsa a alguien. */
  function removeMember(campaignId: string, actorId: string, targetId: string): void {
    if (actorId !== targetId) requireGm(campaignId, actorId);
    else requireMember(campaignId, actorId);
    const c = db.select({ ownerId: campaigns.ownerId }).from(campaigns).where(eq(campaigns.id, campaignId)).get();
    if (c?.ownerId === targetId) throw badRequest('Quien creó la partida no puede salir de ella; bórrala si quieres');
    db.delete(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, targetId)))
      .run();
    ctx.events.emit('campaign:memberRemoved', { campaignId, userId: targetId });
    notify(campaignId, 'campaign:membersChanged');
  }

  return { getRole, requireMember, requireGm, listForUser, create, get, update, remove, joinByInvite, regenerateInvite, setMemberRole, removeMember };
}

export type CampaignService = ReturnType<typeof createCampaignService>;
