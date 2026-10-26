import { and, eq } from 'drizzle-orm';
import {
  evaluate,
  pathEntersRect,
  saveOptions,
  TRIGGER_ICONS,
  type BoardItem,
  type ChatEffect,
  type PublicUser,
  type Scene,
} from '@vtt/shared';
import type { AppContext, ServerModule } from '../../core/module.js';
import { boardItems, campaignMembers, characters, users } from '../../db/schema.js';
import { createBoardBroadcaster } from '../board/broadcast.js';
import { createBoardService } from '../board/service.js';
import { broadcastMessage } from '../chat/index.js';
import { createChatService } from '../chat/service.js';
import { secureRng } from '../dice/service.js';
import { createHomebrewEffects } from '../homebrew/effects.js';
import { createSheetService } from '../sheets/service.js';

/**
 * Trampas y zonas de aviso: cuando un token entra en una (lo suelta alguien o lo mueve la IA),
 * el DM recibe un aviso con sus notas, se cuenta en el chat lo que el DM haya escrito y, si es una
 * trampa con salvación o daño, se tira y se aplica al token. Las de una vez se desarman solas.
 */
export const triggersModule: ServerModule = {
  name: 'triggers',

  init(ctx) {
    const fire = createTriggerRunner(ctx);
    ctx.events.on('item:moved', (e) => {
      fire(e.scene, e.before, e.after, e.path).catch((err) => console.error('Trampa:', err));
    });
  },
};

const center = (i: Pick<BoardItem, 'x' | 'y' | 'width' | 'height'>) => ({ x: i.x + i.width / 2, y: i.y + i.height / 2 });

export function createTriggerRunner(ctx: AppContext) {
  const { db } = ctx;
  const board = createBoardService(ctx);
  const broadcast = createBoardBroadcaster(ctx, board);
  const chat = createChatService(ctx);
  const sheets = createSheetService(ctx);
  const effects = createHomebrewEffects(ctx);

  /** El DM de la partida (en su nombre se aplican los efectos y se escriben los avisos). */
  function gmOf(campaignId: string): PublicUser | null {
    const row = db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, 'gm')))
      .get();
    return row ?? null;
  }

  return async function onMoved(scene: Scene, before: BoardItem, after: BoardItem, path: { x: number; y: number }[]) {
    // Solo tokens de verdad (no dibujos, ni lo de la capa del DM o del mapa).
    if (after.layer !== 'token' || after.drawing) return;
    const zones = db
      .select()
      .from(boardItems)
      .where(eq(boardItems.sceneId, scene.id))
      .all()
      .filter((z) => z.trigger?.active && z.id !== after.id);
    if (!zones.length) return;
    const points = [center(before), ...path, center(after)];
    for (const zone of zones) {
      const t = zone.trigger!;
      if (t.who === 'players' && !after.ownerIds.length) continue;
      if (!pathEntersRect(points, { x: zone.x, y: zone.y, w: zone.width, h: zone.height })) continue;
      await fire(scene, zone as unknown as BoardItem, after);
    }
  };

  async function fire(scene: Scene, zone: BoardItem, token: BoardItem) {
    const t = zone.trigger!;
    const gm = gmOf(scene.campaignId);
    if (!gm) return;
    const character = token.characterId ? db.select().from(characters).where(eq(characters.id, token.characterId)).get() : undefined;
    const who = token.name || character?.name || 'Un token';
    const title = zone.name || (t.kind === 'trap' ? 'Trampa' : 'Zona');
    const base = { campaignId: scene.campaignId, userId: gm.id, userName: gm.displayName, characterId: null, characterName: null, whisperTo: null };

    // Primero se desarma (si es de una vez), para que dos movimientos seguidos no la disparen dos veces.
    if (t.once) {
      const { before, after } = board.systemUpdate(scene.id, zone.id, { trigger: { ...t, active: false } });
      await broadcast.itemChanged(scene, before, after);
    }

    // Aviso al DM, con sus notas.
    const notes = zone.gmNotes.trim();
    await broadcastMessage(ctx, chat.insert({ ...base, kind: 'system', text: `${TRIGGER_ICONS[t.kind]} ${who} ha activado «${title}» (${scene.name}).${notes ? `\n${notes}` : ''}`, roll: null, secret: true }));
    if (t.message) await broadcastMessage(ctx, chat.insert({ ...base, kind: 'system', text: t.message, roll: null, secret: false }));

    // Salvación y daño: se tira y se aplica al token que la ha pisado.
    if (t.kind === 'trap' && (t.save || t.damage)) {
      let damage = 0;
      let rolls: ReturnType<typeof evaluate>['rolls'] = [];
      if (t.damage) {
        try {
          const r = evaluate(t.damage, { rng: secureRng });
          damage = Math.max(0, Math.round(r.value));
          rolls = r.rolls;
        } catch {
          damage = 0;
        }
      }
      const saveLabel = t.save ? (saveOptions(sheets.getTemplate(scene.campaignId)).find((o) => o.value === t.save)?.label ?? t.save) : '';
      const effect: ChatEffect = {
        entryId: `trigger:${zone.id}`,
        name: title,
        attack: null,
        save: t.save ? { ability: t.save, label: saveLabel, dc: t.dc, half: t.half } : null,
        damage,
        damageTypes: t.damageType ? [t.damageType] : [],
        damageParts: [{ type: t.damageType, amount: damage }],
        heal: 0,
        conditions: [],
        area: null,
      };
      const card = chat.insert({
        ...base,
        kind: 'roll',
        text: '',
        roll: { label: `${TRIGGER_ICONS.trap} ${title}${t.damage ? `: daño${t.damageType ? ` ${t.damageType}` : ''}` : ''}`, expression: t.damage, total: damage, rolls, effect },
        secret: false,
      });
      await broadcastMessage(ctx, card);
      await broadcastMessage(ctx, await effects.apply(gm, card.id, [token.id]));
    }

    // Descubrir: lo que haya dentro en la capa del DM pasa a la de tokens; si es una trampa, ella también (se ve el foso).
    if (t.reveal) {
      const r = { x: zone.x, y: zone.y, w: zone.width, h: zone.height };
      const hidden = db
        .select()
        .from(boardItems)
        .where(and(eq(boardItems.sceneId, scene.id), eq(boardItems.layer, 'gm')))
        .all()
        .filter((i) => {
          const c = center(i);
          if (i.id === zone.id) return t.kind === 'trap';
          return (c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h && i.drawing?.type !== 'note');
        });
      for (const i of hidden) {
        const { before, after } = board.systemUpdate(scene.id, i.id, { layer: 'token' });
        await broadcast.itemChanged(scene, before, after);
      }
    }
  }
}
