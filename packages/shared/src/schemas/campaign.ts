import { z } from 'zod';
import type { CampaignRole } from '../roles.js';
import type { PublicUser } from './auth.js';

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(''),
  systemId: z.string().trim().min(1).max(64).default('dnd5e'),
});
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial();
export type UpdateCampaignInput = z.input<typeof updateCampaignSchema>;

export const joinCampaignSchema = z.object({
  inviteCode: z.string().trim().min(4).max(32),
});

export interface CampaignSummary {
  id: string;
  name: string;
  description: string;
  systemId: string;
  role: CampaignRole;
  createdAt: string;
}

export interface CampaignMember extends PublicUser {
  role: CampaignRole;
  joinedAt: string;
  /** Solo para el DM: escena en la que está cada jugador. */
  sceneId?: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  ownerId: string;
  /**
   * Escena de la party. A un jugador se le manda la suya, que puede ser otra si el DM
   * le ha llevado aparte.
   */
  activeSceneId: string | null;
  /** Solo se envía al DM. */
  inviteCode?: string;
  members: CampaignMember[];
}
