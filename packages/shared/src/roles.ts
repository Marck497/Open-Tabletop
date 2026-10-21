/** Rol de un usuario dentro de una partida. */
export const CAMPAIGN_ROLES = ['gm', 'player'] as const;
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export function isGm(role: CampaignRole | null | undefined): boolean {
  return role === 'gm';
}
