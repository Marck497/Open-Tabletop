import { z } from 'zod';
import { campaignRoom, measureSchema, pingSchema, sceneRoom, userColor } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { handleAck } from '../../core/socket-utils.js';
import { requireUser } from '../auth/index.js';
import { createBoardBroadcaster } from './broadcast.js';
import { createBoardService } from './service.js';

const campaignParams = z.object({ id: z.string() });
const sceneParams = z.object({ sceneId: z.string() });

/** Tablero: escenas, tokens, capas y niebla de guerra. */
export const boardModule: ServerModule = {
  name: 'board',

  init(ctx) {
    const board = createBoardService(ctx);
    // Cada partida nueva empieza con una escena lista y activa.
    ctx.events.on('campaign:created', ({ campaignId, userId }) => {
      const scene = board.createScene(campaignId, userId, { name: 'Escena 1' });
      board.setActiveScene(campaignId, userId, scene.id);
    });
    // Si echan a alguien, deja de recibir las escenas de esa partida.
    ctx.events.on('campaign:memberRemoved', async ({ campaignId, userId }) => {
      if (!ctx.io) return;
      const sceneIds = board.sceneIdsOf(campaignId);
      for (const s of await ctx.io.fetchSockets()) {
        if (s.data.user.id !== userId) continue;
        s.leave(campaignRoom(campaignId));
        sceneIds.forEach((id) => s.leave(sceneRoom(id)));
      }
    });
  },

  routes(app, ctx) {
    const board = createBoardService(ctx);
    const broadcast = createBoardBroadcaster(ctx, board);

    app.get('/campaigns/:id/scenes', async (req) => {
      const { id } = campaignParams.parse(req.params);
      return board.listScenes(id, requireUser(req).id);
    });

    app.post('/campaigns/:id/scenes', async (req, reply) => {
      const { id } = campaignParams.parse(req.params);
      const scene = board.createScene(id, requireUser(req).id, req.body as never);
      ctx.io?.to(campaignRoom(id)).emit('scenes:changed', { campaignId: id });
      return reply.code(201).send({ scene });
    });

    app.put('/campaigns/:id/active-scene', async (req) => {
      const { id } = campaignParams.parse(req.params);
      const { sceneId } = z.object({ sceneId: z.string().nullable() }).parse(req.body);
      const { previous } = board.setActiveScene(id, requireUser(req).id, sceneId);
      if (previous && previous !== sceneId) await broadcast.evictPlayers(id, previous);
      ctx.io?.to(campaignRoom(id)).emit('scene:activeChanged', { campaignId: id, sceneId });
      return { ok: true };
    });

    app.patch('/scenes/:sceneId', async (req) => {
      const { sceneId } = sceneParams.parse(req.params);
      const scene = board.updateScene(sceneId, requireUser(req).id, req.body as never);
      broadcast.sceneUpdated(scene);
      return { scene };
    });

    app.delete('/scenes/:sceneId', async (req) => {
      const { sceneId } = sceneParams.parse(req.params);
      const { campaignId, wasActive } = board.deleteScene(sceneId, requireUser(req).id);
      ctx.io?.to(sceneRoom(sceneId)).emit('scene:removed', { sceneId });
      ctx.io?.in(sceneRoom(sceneId)).socketsLeave(sceneRoom(sceneId));
      ctx.io?.to(campaignRoom(campaignId)).emit('scenes:changed', { campaignId });
      if (wasActive) ctx.io?.to(campaignRoom(campaignId)).emit('scene:activeChanged', { campaignId, sceneId: null });
      return { ok: true };
    });
  },

  socket(socket, ctx) {
    const board = createBoardService(ctx);
    const broadcast = createBoardBroadcaster(ctx, board);
    const userId = () => socket.data.user.id;
    const author = () => ({ userId: userId(), name: socket.data.user.displayName, color: userColor(userId()) });

    /** Al irse de una escena, su regla desaparece para los demás. */
    function clearMeasure(room: string) {
      socket.to(room).emit('board:measure', { sceneId: room.slice('scene:'.length), ...author(), measure: null });
    }
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) if (room.startsWith('scene:')) clearMeasure(room);
    });

    socket.on('scene:view', (payload, ack) =>
      handleAck(ack, async () => {
        const { sceneId } = sceneParams.parse(payload);
        const { viewer: _v, ...state } = board.view(sceneId, userId());
        // Solo se escucha una escena a la vez.
        for (const room of socket.rooms) {
          if (room.startsWith('scene:') && room !== sceneRoom(sceneId)) {
            clearMeasure(room);
            await socket.leave(room);
          }
        }
        await socket.join(sceneRoom(sceneId));
        return state;
      }),
    );

    socket.on('item:create', (payload, ack) =>
      handleAck(ack, async () => {
        const { scene, item } = board.createItem(payload.sceneId, userId(), payload.item);
        await broadcast.itemChanged(scene, null, item);
        return item;
      }),
    );

    socket.on('item:update', (payload, ack) =>
      handleAck(ack, async () => {
        const { scene, before, after } = board.updateItem(payload.sceneId, payload.id, userId(), payload.patch);
        await broadcast.itemChanged(scene, before, after);
        return after;
      }),
    );

    socket.on('item:delete', (payload, ack) =>
      handleAck(ack, async () => {
        const { scene, before } = board.deleteItem(payload.sceneId, payload.id, userId());
        await broadcast.itemChanged(scene, before, null);
        return undefined;
      }),
    );

    socket.on('item:moving', async (payload) => {
      const parsed = z.object({ sceneId: z.string(), id: z.string(), x: z.number(), y: z.number() }).safeParse(payload);
      if (!parsed.success) return;
      const { sceneId, id, x, y } = parsed.data;
      const res = board.canMove(sceneId, id, userId());
      if (res) await broadcast.itemMoving(res.scene, res.item, x, y, socket);
    });

    // Reglas, plantillas y pings: efímeros, solo se validan y se reenvían.
    socket.on('board:measure', async (payload) => {
      const parsed = z.object({ sceneId: z.string(), measure: measureSchema.nullable(), gmOnly: z.boolean().optional() }).safeParse(payload);
      if (!parsed.success || !socket.rooms.has(sceneRoom(parsed.data.sceneId))) return;
      const { sceneId, measure, gmOnly } = parsed.data;
      try {
        const { scene, viewer } = board.access(sceneId, userId());
        await broadcast.relay(scene, socket, 'board:measure', { sceneId, ...author(), measure }, gmOnly && viewer.role === 'gm');
      } catch {
        // Sin acceso: se ignora.
      }
    });

    socket.on('board:ping', async (payload) => {
      const parsed = z.object({ sceneId: z.string() }).and(pingSchema).safeParse(payload);
      if (!parsed.success || !socket.rooms.has(sceneRoom(parsed.data.sceneId))) return;
      const { sceneId, x, y, focus } = parsed.data;
      try {
        const { scene, viewer } = board.access(sceneId, userId());
        await broadcast.relay(scene, socket, 'board:ping', { sceneId, ...author(), x, y, focus: focus && viewer.role === 'gm' });
      } catch {
        // Sin acceso: se ignora.
      }
    });

    socket.on('fog:set', (payload, ack) =>
      handleAck(ack, async () => {
        await broadcast.fogChanged(board.setFog(payload.sceneId, userId(), payload.fog));
        return undefined;
      }),
    );

    socket.on('fog:add', (payload, ack) =>
      handleAck(ack, async () => {
        await broadcast.fogChanged(board.addFogOp(payload.sceneId, userId(), payload.op));
        return undefined;
      }),
    );
  },
};
