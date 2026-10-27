import { and, eq } from 'drizzle-orm';
import {
  tr,
  fxForHomebrew,
  fxForRow,
  applyDefenses,
  damageTypesIn,
  defensesOf,
  DAMAGE_TYPE_SUGGESTIONS,
  type DamagePiece,
  allFields,
  combatOf,
  createResolver,
  DEFAULT_TOKEN_AI,
  evaluate,
  ExprError,
  formatDistance,
  blocksMove,
  planTurn,
  seesRect,
  statusesOf,
  wallGrid,
  type AiTurnResult,
  type BoardItem,
  type Character,
  type ChatMessage,
  type ChatRoll,
  splitRoll,
  type DiceRoll,
  type InitiativeState,
  type PlanCreature,
  type Scene,
  type SheetRow,
  type SheetTemplate,
  type TokenAi,
  type HomebrewEntry,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, notFound } from '../../core/errors.js';
import { boardItems, campaignMembers, campaigns, characters, users } from '../../db/schema.js';
import { createBoardBroadcaster } from '../board/broadcast.js';
import { createBoardService } from '../board/service.js';
import { createCampaignService } from '../campaigns/service.js';
import { createHomebrewService } from '../homebrew/service.js';
import { broadcastMessage } from '../chat/index.js';
import { createChatService } from '../chat/service.js';
import { secureRng } from '../dice/service.js';
import { broadcastCharacter } from '../sheets/index.js';
import { createSheetService } from '../sheets/service.js';
import { createFxService } from '../fx/service.js';

/** Pausa entre casillas al animar el movimiento de un enemigo. */
export const STEP_MS = 140;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Attack {
  name: string;
  attack: string;
  damage: string;
  /** Daño extra de la fila (p. ej. "1d6" de "1d6 fuego") y desde qué número del d20 es crítico. */
  extra?: string;
  critFrom?: number;
  resolve?: (name: string) => unknown;
  /** Creación enlazada (para su animación). */
  entry?: HomebrewEntry | null;
  /** Tipo del daño y del daño extra (para resistencias); '' si no se sabe. */
  damageType?: string;
  extraType?: string;
}

/** Primer tipo de daño conocido que aparece en el texto. */
const typeIn = (text: unknown) => damageTypesIn(String(text ?? ''), DAMAGE_TYPE_SUGGESTIONS)[0] ?? '';

/** Turno de un enemigo con IA: moverse por la cuadrícula, atacar y anotarlo en el chat. */
export function createAiService(ctx: AppContext) {
  const { db } = ctx;
  const board = createBoardService(ctx);
  const broadcast = createBoardBroadcaster(ctx, board);
  const sheets = createSheetService(ctx);
  const chat = createChatService(ctx);
  const campaignsSvc = createCampaignService(ctx);
  const homebrew = createHomebrewService(ctx);
  const fx = createFxService(ctx);

  function activeSceneId(campaignId: string) {
    return db.select({ id: campaigns.activeSceneId }).from(campaigns).where(eq(campaigns.id, campaignId)).get()?.id ?? null;
  }

  /** Token del turno actual: el de la entrada o, si no tiene, el de su personaje en la escena activa. */
  function currentItemId(campaignId: string, state: InitiativeState): string | null {
    const entry = state.entries[state.turn];
    if (!entry) return null;
    if (entry.itemId) return entry.itemId;
    const sceneId = activeSceneId(campaignId);
    if (!entry.characterId || !sceneId) return null;
    return (
      db
        .select({ id: boardItems.id })
        .from(boardItems)
        .where(and(eq(boardItems.sceneId, sceneId), eq(boardItems.characterId, entry.characterId)))
        .get()?.id ?? null
    );
  }

  /** El DM en cuyo nombre escribe la IA (quien la ha activado, o el primer DM de la partida). */
  function gmUser(campaignId: string, preferred?: string) {
    if (preferred && campaignsSvc.getRole(campaignId, preferred) === 'gm') {
      const u = db.select().from(users).where(eq(users.id, preferred)).get();
      if (u) return { id: u.id, displayName: u.displayName };
    }
    const row = db
      .select({ id: users.id, displayName: users.displayName })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, 'gm')))
      .get();
    if (!row) throw notFound('La partida no tiene DM');
    return row;
  }

  function characterOf(item: BoardItem): Character | null {
    if (!item.characterId) return null;
    const row = db.select({ id: characters.id }).from(characters).where(eq(characters.id, item.characterId)).get();
    return row ? sheets.row(row.id) : null;
  }

  const numberOf = (resolve: (n: string) => unknown, expr: string): number | null => {
    if (!expr.trim()) return null;
    try {
      const v = Number(evaluate(expr, { resolve, rng: () => 0.5 }).value);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  };

  function stats(template: SheetTemplate, character: Character | null) {
    const combat = combatOf(template);
    if (!character || !combat) return { hp: null, hpMax: null, ac: null, speed: null, resolve: undefined };
    const resolve = createResolver(template, character.values);
    return {
      hp: numberOf(resolve, combat.hp),
      hpMax: numberOf(resolve, combat.hpMax),
      ac: numberOf(resolve, combat.ac),
      speed: numberOf(resolve, combat.speed),
      resolve,
    };
  }

  /** Ataque que usará: el de la configuración de IA o una fila de la tabla de ataques de su hoja. */
  function attackOf(template: SheetTemplate, character: Character | null, ai: TokenAi): Attack | null {
    if (ai.attack) return { name: ai.attackName || tr('Ataque'), attack: ai.attack, damage: ai.damage, damageType: typeIn(`${ai.attackName} ${ai.damage}`) };
    const combat = combatOf(template);
    if (!character || !combat?.attacks) return null;
    const { list, name, attack, damage, extra, crit } = combat.attacks;
    const rows = character.values[list];
    if (!Array.isArray(rows) || !rows.length) return null;
    const row = (rows[ai.attackIndex] ?? rows[0]) as SheetRow;
    // Fila enlazada a una creación con tirada de ataque: se usa la creación.
    const entry = typeof row._ref === 'string' ? homebrew.find(character.campaignId, row._ref) : null;
    const d = entry?.data;
    if (entry && d && d.attack !== 'none' && d.attackBonus.trim()) {
      const parts = d.damage.filter((p) => p.dice.trim());
      const dice = parts.map((p) => p.dice.trim());
      return {
        damageType: parts[0]?.type ?? '',
        extraType: parts[1]?.type ?? '',
        name: entry.name,
        attack: `1d20 + (${d.attackBonus})`,
        damage: dice[0] ?? '0',
        extra: dice.length > 1 ? dice.slice(1).join(' + ') : undefined,
        critFrom: d.critFrom,
        resolve: createResolver(template, character.values, row),
        entry,
      };
    }
    const columns = allFields(template).find((f) => f.key === list)?.columns ?? [];
    const rollOf = (key: string) => columns.find((c) => c.key === key)?.roll || `@{${key}}`;
    return {
      name: String(row[name] || tr('Ataque')),
      attack: rollOf(attack),
      damage: rollOf(damage),
      extra: extra && row[extra] ? splitRoll(String(row[extra])).expression || undefined : undefined,
      damageType: typeIn(`${row[damage] ?? ''} ${row.tipo ?? ''}`),
      extraType: extra ? typeIn(row[extra]) : '',
      critFrom: crit ? Math.min(20, Math.max(2, Number(row[crit]) || 20)) : 20,
      resolve: createResolver(template, character.values, row),
    };
  }

  function roll(expr: string, resolve?: (n: string) => unknown) {
    try {
      return evaluate(expr, { resolve, rng: secureRng });
    } catch (e) {
      if (e instanceof ExprError) throw badRequest(`Tirada no válida (${expr}): ${e.message}`);
      throw e;
    }
  }

  const keptSum = (rolls: DiceRoll[]) => rolls.reduce((sum, r) => sum + r.kept.reduce((s, i) => s + (r.results[i] ?? 0), 0), 0);
  /** El primer d20 que cuenta (para críticos y pifias). */
  const natural20 = (rolls: DiceRoll[]) => {
    const d20 = rolls.find((r) => r.sides === 20);
    return d20 ? (d20.results[d20.kept[0] ?? 0] ?? null) : null;
  };

  async function animate(scene: Scene, item: BoardItem, path: { col: number; row: number }[]) {
    const g = scene.gridSize;
    for (const step of path.slice(0, -1)) {
      await broadcast.itemMoving(scene, item, step.col * g, step.row * g, null);
      await sleep(STEP_MS);
    }
    const end = path[path.length - 1]!;
    const { before, after } = board.systemUpdate(scene.id, item.id, { x: end.col * g, y: end.row * g });
    await broadcast.itemChanged(scene, before, after);
    // Por si pisa una trampa (las que dispara cualquier token): el camino, casilla a casilla, por sus centros.
    const half = g / 2;
    ctx.events.emit('item:moved', { scene, before, after, path: path.slice(0, -1).map((p) => ({ x: p.col * g + half * (item.width / g), y: p.row * g + half * (item.height / g) })) });
  }

  async function say(base: Omit<ChatMessage, 'id' | 'createdAt' | 'kind' | 'text' | 'roll'>, kind: ChatMessage['kind'], text: string, r: ChatRoll | null) {
    await broadcastMessage(ctx, chat.insert({ ...base, kind, text, roll: r }));
  }

  /**
   * Juega el turno de un token. `force`: lo hace aunque el token no tenga la IA
   * activada (cuando el DM pulsa "Actuar"), con el comportamiento por defecto.
   */
  async function takeTurn(campaignId: string, itemId: string, opts: { userId?: string; force?: boolean; applyDamage: boolean }): Promise<AiTurnResult | null> {
    const sceneId = activeSceneId(campaignId);
    if (!sceneId) return null;
    const { scene, items } = board.itemsOf(sceneId);
    const item = items.find((i) => i.id === itemId);
    if (!item) return null;
    const ai: TokenAi | null = item.ai?.enabled ? item.ai : opts.force ? { ...DEFAULT_TOKEN_AI, ...item.ai, enabled: true } : null;
    if (!ai) return null;

    const template = sheets.getTemplate(campaignId);
    const g = scene.gridSize;
    const character = characterOf(item);
    const self = stats(template, character);
    const name = item.name || character?.name || tr('Enemigo');
    const gm = gmUser(campaignId, opts.userId);
    const base = {
      campaignId,
      userId: gm.id,
      userName: gm.displayName,
      characterId: character?.id ?? null,
      characterName: name,
      whisperTo: null,
      // Lo que hace un enemigo escondido (capa del DM) solo lo ve el DM.
      secret: item.layer === 'gm',
    };

    // Un estado que incapacita (aturdido, paralizado...) le hace perder el turno.
    const statuses = statusesOf(template);
    const incapacitatedBy = (i: BoardItem) => statuses.find((d) => d.incapacitated && i.statuses.includes(d.id));
    const blocked = incapacitatedBy(item);
    if (blocked) {
      const summary = tr('no puede actuar ({0})', { '0': tr(blocked.label).toLowerCase() });
      await say(base, 'emote', `${summary}.`, null);
      return { itemId: item.id, name, summary, moved: 0, attacked: false, hit: null, damage: null };
    }

    const cellOf = (i: BoardItem) => ({ col: Math.round(i.x / g), row: Math.round(i.y / g) });
    const sizeOf = (i: BoardItem) => Math.max(1, Math.round(Math.max(i.width, i.height) / g));

    // Objetivos: tokens de jugadores (con dueño o con personaje controlado por alguien) que sigan en pie.
    const targets: (PlanCreature & { item: BoardItem; character: Character | null; ac: number | null })[] = [];
    const others: { cell: { col: number; row: number }; size: number }[] = [];
    for (const other of items) {
      // Los dibujos no son criaturas: ni objetivos ni obstáculos.
      if (other.id === item.id || other.layer === 'map' || other.drawing) continue;
      const ch = characterOf(other);
      const isPlayer = other.layer === 'token' && (other.ownerIds.length > 0 || (ch?.controlledBy.length ?? 0) > 0);
      const st = stats(template, ch);
      // Fuera de combate: a 0 PG o, si no tiene hoja, marcado con un estado que incapacita (p. ej. muerto).
      const down = st.hp !== null ? st.hp <= 0 : !!incapacitatedBy(other);
      if (isPlayer && !down) {
        targets.push({ id: other.id, name: other.name || ch?.name || 'alguien', cell: cellOf(other), size: sizeOf(other), hp: st.hp, hpMax: st.hpMax, item: other, character: ch, ac: st.ac });
      } else {
        others.push({ cell: cellOf(other), size: sizeOf(other) });
      }
    }

    // Paredes: no las atraviesa al moverse y necesita ver a su objetivo para atacarle.
    const centerOf = (c: { col: number; row: number }, size: number) => ({ x: (c.col + size / 2) * g, y: (c.row + size / 2) * g });
    const crossesWall = wallGrid(scene.walls, g, blocksMove);
    const selfSize = sizeOf(item);
    const walls = scene.walls.length
      ? {
          blocked: (a: { col: number; row: number }, b: { col: number; row: number }) => crossesWall(centerOf(a, selfSize), centerOf(b, selfSize)),
          sees: (c: { col: number; row: number }, t: PlanCreature) => {
            const it = targets.find((x) => x.id === t.id)?.item;
            return !it || seesRect([centerOf(c, selfSize)], it, scene.walls);
          },
        }
      : {};

    const speedUnits = ai.speed ?? self.speed ?? 30;
    const plan = planTurn({
      ...walls,
      cols: scene.widthCells,
      rows: scene.heightCells,
      self: { id: item.id, name, cell: cellOf(item), size: selfSize, hp: self.hp, hpMax: self.hpMax },
      speed: speedUnits / scene.cellDistance,
      ai,
      targets,
      others,
      diagonalCost: scene.diagonalRule === '5e' ? 1 : 1.5,
      rng: secureRng,
    });

    if (plan.path.length) await animate(scene, item, plan.path);
    const moved = plan.path.length;
    const movedText = moved ? tr(' (se mueve {0})', { '0': formatDistance(moved, scene) }) : '';
    const result: AiTurnResult = { itemId: item.id, name, summary: plan.reason, moved, attacked: false, hit: null, damage: null };

    const target = targets.find((t) => t.id === plan.targetId);
    const attack = plan.attack && target ? attackOf(template, character, ai) : null;
    if (plan.attack && target && !attack) {
      result.summary = tr('{reason}, pero no tiene ningún ataque configurado', { reason: plan.reason });
      await say(base, 'emote', `${result.summary}${movedText}.`, null);
      return result;
    }
    await say(base, 'emote', `${plan.reason}${movedText}.`, null);
    if (!attack || !target) return result;

    // Ataque: un 20 natural siempre impacta (crítico) y un 1 siempre falla.
    const atk = roll(attack.attack, attack.resolve);
    const nat = natural20(atk.rolls);
    const crit = nat !== null && nat >= (attack.critFrom ?? 20);
    const hit = crit ? true : nat === 1 ? false : target.ac === null ? null : atk.value >= target.ac;
    const verdict = crit ? tr('¡crítico!') : hit === null ? tr('¿impacta?') : hit ? tr('impacta') : nat === 1 ? tr('pifia') : tr('falla');
    const acText = target.ac === null ? '' : tr(' (CA {ac})', { ac: target.ac });
    await say(base, 'roll', '', { label: `${attack.name} → ${target.name}${acText}: ${verdict}`, expression: attack.attack, total: atk.value, rolls: atk.rolls });
    const cue = attack.entry ? fxForHomebrew(attack.entry, crit) : fxForRow('attack', attack.name, [attack.damage, attack.extra].filter(Boolean).join(' '), crit);
    if (cue) await fx.play({ userId: gm.id, campaignId, originItemId: item.id, target: { sceneId: scene.id, targetIds: [target.item.id] }, cue, secret: base.secret });
    result.attacked = true;
    result.hit = hit;
    if (hit === false || !attack.damage) return result;

    // Daño: en un crítico se tiran el doble de dados.
    let total = 0;
    let rolls: DiceRoll[] = [];
    const typed: DamagePiece[] = [];
    for (const [expr, type] of [
      [attack.damage, attack.damageType],
      [attack.extra, attack.extraType],
    ] as const) {
      if (!expr) continue;
      const dmg = roll(expr, attack.resolve);
      let amount = dmg.value;
      rolls = [...rolls, ...dmg.rolls];
      if (crit) {
        const again = roll(expr, attack.resolve);
        amount += keptSum(again.rolls);
        rolls = [...rolls, ...again.rolls];
      }
      total += amount;
      typed.push({ type: type ?? '', amount: Math.max(0, Math.round(amount)) });
    }
    total = Math.max(0, Math.round(total));
    // Resistencias, inmunidades y vulnerabilidades del objetivo (de su hoja y sus estados).
    const defended = applyDefenses(typed, defensesOf(template, target.character?.values ?? null, target.item.statuses));
    const why = defended.notes.length ? ` (${defended.notes.join(', ')}: ${defended.total})` : '';
    if (defended.notes.length) total = defended.total;
    result.damage = total;

    let applied = '';
    const combat = combatOf(template);
    const hpField = combat?.hp ? allFields(template).find((f) => f.key === combat.hp && f.type === 'number') : undefined;
    if (hit && opts.applyDamage && target.character && hpField && target.hp !== null) {
      const hp = Math.max(0, target.hp - total);
      const before = target.character;
      db.update(characters)
        .set({ values: { ...before.values, [hpField.key]: hp }, updatedAt: new Date().toISOString() })
        .where(eq(characters.id, before.id))
        .run();
      await broadcastCharacter(ctx, before, sheets.row(before.id));
      applied = hp === 0 ? tr(' ({name} cae a 0)', { name: target.name }) : ` (${target.hp} → ${hp})`;
    }
    await say(base, 'roll', '', { label: tr('Daño a {name}{1}{why}{applied}', { name: target.name, '1': crit ? tr(' (crítico)') : '', why, applied }), expression: [attack.damage, attack.extra].filter(Boolean).join(' + '), total: typed.reduce((s, p) => s + p.amount, 0), rolls });
    return result;
  }

  return { takeTurn, currentItemId };
}
