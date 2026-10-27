import { z } from 'zod';
import {
  localName,
  tr,
  adventureInputSchema,
  campaignRoom,
  monsterAi,
  monsterById,
  planAdventure,
  SIZE_CELLS,
  TRIGGER_COLORS,
  TRIGGER_ICONS,
  withAutoWalls,
  type CreateItemInput,
  type Scene,
  type Wall,
} from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { requireUser } from '../auth/index.js';
import { createBoardService } from '../board/service.js';
import { createCampaignService } from '../campaigns/service.js';
import { makeSpotFinder } from '../encounters/service.js';
import { createSheetService } from '../sheets/service.js';

export interface AdventureSummary {
  places: number;
  encounters: number;
  monsters: number;
  traps: number;
}

/**
 * Asistente de aventura rápida (solo el DM): crea una escena nueva con el mapa generado y amueblado,
 * una nota numerada por sala, los monstruos de cada encuentro escondidos (y una zona que los descubre
 * al entrar), trampas y un cofre con el tesoro. Los jugadores no ven nada de eso hasta que toca.
 */
export function createAdventureService(ctx: AppContext) {
  const board = createBoardService(ctx);
  const sheets = createSheetService(ctx);
  const campaigns = createCampaignService(ctx);

  function create(campaignId: string, userId: string, body: unknown): { scene: Scene; summary: AdventureSummary } {
    campaigns.requireGm(campaignId, userId);
    const input = adventureInputSchema.parse(body);
    const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
    const plan = planAdventure({ ...input, seed });
    const { width: w, height: h, map } = plan;

    const scene = board.createScene(campaignId, userId, { name: input.name, widthCells: w, heightCells: h, vision: true, exploration: true });
    const g = scene.gridSize;
    const px = (d: { x1: number; y1: number; x2: number; y2: number }) => ({ x1: d.x1 * g, y1: d.y1 * g, x2: d.x2 * g, y2: d.y2 * g });
    const manual: Wall[] = [
      ...map.doors.map((d, i) => ({ id: `ad${i}`, ...px(d), kind: 'door' as const, open: false, locked: false })),
      ...(map.walls ?? []).map((d, i) => ({ id: `aw${i}`, ...px(d), kind: 'wall' as const, open: false, locked: false })),
    ];
    board.setTerrain(scene.id, userId, map.terrain, withAutoWalls(manual, map.terrain, w, h, g));

    const add = (item: CreateItemInput) => board.createItem(scene.id, userId, item).item;
    for (const o of map.objects) add({ layer: 'map', x: o.x * g, y: o.y * g, width: o.size * g, height: o.size * g, drawing: { type: 'stamp', text: o.emoji }, light: o.light });

    const summary: AdventureSummary = { places: plan.places.length, encounters: 0, monsters: 0, traps: 0 };
    const noteSize = Math.round(g * 0.8);
    for (const p of plan.places) {
      // Nota numerada en la esquina de la sala.
      add({ layer: 'gm', x: p.rect.x * g + 4, y: p.rect.y * g + 4, width: noteSize, height: noteSize, name: p.title, gmNotes: p.text, drawing: { type: 'note', text: String(p.n) } });

      if (p.treasure) add({ layer: 'map', x: p.treasure.x * g, y: p.treasure.y * g, width: g, height: g, drawing: { type: 'stamp', text: '🧰' } });

      if (p.trap) {
        summary.traps++;
        add({
          layer: 'gm',
          x: p.trap.rect.x * g,
          y: p.trap.rect.y * g,
          width: p.trap.rect.w * g,
          height: p.trap.rect.h * g,
          name: p.trap.name,
          gmNotes: p.trap.notes,
          drawing: { type: 'zone', text: TRIGGER_ICONS.trap, stroke: TRIGGER_COLORS.trap },
          trigger: p.trap.trigger,
        });
      }

      if (p.encounter) {
        summary.encounters++;
        const now = board.itemsOf(scene.id);
        const spot = makeSpotFinder(now.scene, now.items, Math.floor(p.rect.x + p.rect.w / 2), Math.floor(p.rect.y + p.rect.h / 2));
        // Caja que cubre la sala y a todos los monstruos (por si alguno no cabe dentro).
        let [x0, y0, x1, y1] = [p.rect.x, p.rect.y, p.rect.x + p.rect.w, p.rect.y + p.rect.h];
        const totals = new Map(p.encounter.monsters.map((m) => [m.monsterId, m.count]));
        for (const entry of p.encounter.monsters) {
          const monster = monsterById(entry.monsterId);
          if (!monster) continue;
          for (let k = 1; k <= entry.count; k++) {
            const size = SIZE_CELLS[monster.size];
            const at = spot(size);
            if (!at) break;
            const name = (totals.get(monster.id) ?? 0) > 1 ? `${localName(monster)} ${k}` : localName(monster);
            const character = sheets.createFromMonster(campaignId, userId, monster.id, name);
            add({ layer: 'gm', x: at.x * g, y: at.y * g, width: size * g, height: size * g, name, showName: true, characterId: character.id, ai: monsterAi(monster) });
            summary.monsters++;
            [x0, y0, x1, y1] = [Math.min(x0, at.x), Math.min(y0, at.y), Math.max(x1, at.x + size), Math.max(y1, at.y + size)];
          }
        }
        if (input.ambush) {
          const line = p.text.split('\n').find((l) => l.startsWith('Encuentro') || l.startsWith('Jefe')) ?? '';
          add({
            layer: 'gm',
            x: x0 * g,
            y: y0 * g,
            width: (x1 - x0) * g,
            height: (y1 - y0) * g,
            name: tr('Encuentro: {title}', { title: p.title }),
            gmNotes: line,
            drawing: { type: 'zone', text: TRIGGER_ICONS.zone, stroke: TRIGGER_COLORS.zone },
            trigger: { kind: 'zone', reveal: true, once: true, who: 'players' },
          });
        }
      }
    }
    return { scene: board.itemsOf(scene.id).scene, summary };
  }

  return { create };
}

const params = z.object({ id: z.string() });

export const adventureModule: ServerModule = {
  name: 'adventure',
  routes(app, ctx) {
    const adventures = createAdventureService(ctx);
    app.post('/campaigns/:id/adventure', async (req, reply) => {
      const { id } = params.parse(req.params);
      const result = adventures.create(id, requireUser(req).id, req.body);
      ctx.io?.to(campaignRoom(id)).emit('scenes:changed', { campaignId: id });
      return reply.code(201).send(result);
    });
  },
};
