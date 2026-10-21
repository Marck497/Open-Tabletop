import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { isAudioMime, MAX_JUKEBOX_TRACKS, type JukeboxAction, type JukeboxState } from '@vtt/shared';
import { z } from 'zod';
import type { AppContext } from '../../core/module.js';
import { badRequest } from '../../core/errors.js';
import { assets, jukebox } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';

const patchSchema = z
  .object({ name: z.string().trim().min(1).max(80), volume: z.number().min(0).max(1), loop: z.boolean() })
  .partial();

/** Música de la partida: qué pistas hay y cuáles suenan. */
export function createJukeboxService(ctx: AppContext) {
  const { db } = ctx;
  const campaigns = createCampaignService(ctx);

  function load(campaignId: string): JukeboxState {
    const row = db.select().from(jukebox).where(eq(jukebox.campaignId, campaignId)).get();
    return { campaignId, tracks: row?.tracks ?? [] };
  }

  function save(state: JukeboxState): JukeboxState {
    db.insert(jukebox)
      .values(state)
      .onConflictDoUpdate({ target: jukebox.campaignId, set: { tracks: state.tracks } })
      .run();
    return state;
  }

  function get(campaignId: string, userId: string): JukeboxState {
    campaigns.requireMember(campaignId, userId);
    return load(campaignId);
  }

  function apply(campaignId: string, userId: string, action: JukeboxAction): JukeboxState {
    campaigns.requireGm(campaignId, userId);
    const state = load(campaignId);
    const now = Date.now();
    const map = (id: string, fn: (t: JukeboxState['tracks'][number]) => JukeboxState['tracks'][number]) => {
      if (!state.tracks.some((t) => t.id === id)) throw badRequest('Pista no encontrada');
      return save({ ...state, tracks: state.tracks.map((t) => (t.id === id ? fn(t) : t)) });
    };
    switch (action.type) {
      case 'add': {
        const asset = db.select().from(assets).where(eq(assets.id, z.string().parse(action.assetId))).get();
        if (asset?.campaignId !== campaignId || !isAudioMime(asset.mime)) throw badRequest('Audio no válido');
        if (state.tracks.length >= MAX_JUKEBOX_TRACKS) throw badRequest('Demasiadas pistas');
        const name = (action.name?.trim() || asset.name.replace(/\.[^.]+$/, '')).slice(0, 80);
        return save({ ...state, tracks: [...state.tracks, { id: randomUUID(), assetId: asset.id, name, volume: 0.7, loop: true, startedAt: null }] });
      }
      case 'update':
        return map(action.id, (t) => ({ ...t, ...patchSchema.parse(action.patch) }));
      case 'play':
        return map(action.id, (t) => ({ ...t, startedAt: now }));
      case 'stop':
        return map(action.id, (t) => ({ ...t, startedAt: null }));
      case 'stopAll':
        return save({ ...state, tracks: state.tracks.map((t) => ({ ...t, startedAt: null })) });
      case 'remove':
        return save({ ...state, tracks: state.tracks.filter((t) => t.id !== action.id) });
      default:
        throw badRequest('Acción desconocida');
    }
  }

  return { get, apply };
}
