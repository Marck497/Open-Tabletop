import { campaignRoom, type PresenceUser } from '@vtt/shared';
import type { IoServer, ServerModule } from '../../core/module.js';
import { createCampaignService } from '../campaigns/service.js';

/** Lista de usuarios conectados a la sala de una partida (sin duplicados si abren varias pestañas). */
async function onlineUsers(io: IoServer, campaignId: string): Promise<PresenceUser[]> {
  const sockets = await io.in(campaignRoom(campaignId)).fetchSockets();
  const byId = new Map<string, PresenceUser>();
  for (const s of sockets) byId.set(s.data.user.id, { userId: s.data.user.id, displayName: s.data.user.displayName });
  return [...byId.values()];
}

async function broadcastPresence(io: IoServer, campaignId: string) {
  io.to(campaignRoom(campaignId)).emit('presence:update', { campaignId, online: await onlineUsers(io, campaignId) });
}

/** Unirse/salir de la sala en tiempo real de una partida y saber quién está conectado. */
export const presenceModule: ServerModule = {
  name: 'presence',
  socket(socket, ctx) {
    const campaigns = createCampaignService(ctx);
    const io = ctx.io!;

    socket.on('campaign:join', async ({ campaignId }, ack) => {
      if (!campaigns.getRole(campaignId, socket.data.user.id)) return ack({ ok: false, error: 'Partida no encontrada' });
      await socket.join(campaignRoom(campaignId));
      await broadcastPresence(io, campaignId);
      ack({ ok: true, data: { online: await onlineUsers(io, campaignId) } });
    });

    socket.on('campaign:leave', async ({ campaignId }) => {
      await socket.leave(campaignRoom(campaignId));
      await broadcastPresence(io, campaignId);
    });

    socket.on('disconnecting', () => {
      const rooms = [...socket.rooms].filter((r) => r.startsWith('campaign:'));
      // Tras desconectar, el socket ya no cuenta en la sala.
      setImmediate(() => rooms.forEach((r) => void broadcastPresence(io, r.slice('campaign:'.length))));
    });
  },
};
