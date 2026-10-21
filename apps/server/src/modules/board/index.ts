import { z } from 'zod';
import { campaignRoom, sceneRoom, type AckResult } from '@vtt/shared';
import type { ServerModule } from '../../core/module.js';
import { AppError } from '../../core/errors.js';
import { requireUser } from '../auth/index.js';
import { createBoardBroadcaster } from './broadcast.js';
import { createBoardService } from './service.js';

const campaignParams = z.object({ id: z.string() });
const sceneParams = z.object({ sceneId: z.string() });

/** Ejecuta un manejador de socket y responde por el ack con datos o con el mensaje de error. */
async function handle<T>(ack: ((r: AckResult<T>) => void) | undefined, fn: () => Promise<T> | T) {
  try {
    const data = await fn();
    ack?.({ ok: true, data });
  } catch (err) {
    const message = err instanceof AppError || err instanceof z.ZodError ? (err instanceof z.ZodError ? 'Datos no válidos' : err.message) : 'Error interno';
    if (!(err instanceof AppError) && !(err instanceof z.ZodError)) console.error(err);
    ack?.({ ok: false, error: message });
  }
}

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

    socket.on('scene:view', (payload, ack) =>
      handle(ack, async () => {
        const { sceneId } = sceneParams.parse(payload);
        const { viewer: _v, ...state } = board.view(sceneId, userId());
        // Solo se escucha una escena a la vez.
        for (const room of socket.rooms) if (room.startsWith('scene:') && room !== sceneRoom(sceneId)) await socket.leave(room);
        await socket.join(sceneRoom(sceneId));
        return state;
      }),
    );

    socket.on('item:create', (payload, ack) =>
      handle(ack, async () => {
        const { scene, item } = board.createItem(payload.sceneId, userId(), payload.item);
        await broadcast.itemChanged(scene, null, item);
        return item;
      }),
    );

    socket.on('item:update', (payload, ack) =>
      handle(ack, async () => {
        const { scene, before, after } = board.updateItem(payload.sceneId, payload.id, userId(), payload.patch);
        await broadcast.itemChanged(scene, before, after);
        return after;
      }),
    );

    socket.on('item:delete', (payload, ack) =>
      handle(ack, async () => {
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

    socket.on('fog:set', (payload, ack) =>
      handle(ack, async () => {
        await broadcast.fogChanged(board.setFog(payload.sceneId, userId(), payload.fog));
        return undefined;
      }),
    );

    socket.on('fog:add', (payload, ack) =>
      handle(ack, async () => {
        await broadcast.fogChanged(board.addFogOp(payload.sceneId, userId(), payload.op));
        return undefined;
      }),
    );
  },
};
