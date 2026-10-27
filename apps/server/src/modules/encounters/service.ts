import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import {
  localName,
  canMoveStraight,
  deployEncounterSchema,
  encounterInputSchema,
  isSolidCell,
  monsterAi,
  monsterById,
  normalizeTerrain,
  SIZE_CELLS,
  updateEncounterSchema,
  type BoardItem,
  type Character,
  type DeployEncounterInput,
  type Encounter,
  type EncounterInput,
  type Scene,
  type UpdateEncounterInput,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, notFound } from '../../core/errors.js';
import { encounters } from '../../db/schema.js';
import { createBoardService } from '../board/service.js';
import { createCampaignService } from '../campaigns/service.js';
import { createSheetService } from '../sheets/service.js';

type Row = typeof encounters.$inferSelect;
const toEncounter = (r: Row): Encounter => ({ id: r.id, campaignId: r.campaignId, name: r.name, notes: r.notes, monsters: r.monsters, createdAt: r.createdAt });

/**
 * Busca dónde poner tokens de `size` casillas cerca de la casilla (cx, cy): casillas libres (sin otro
 * token, sin muro ni vacío si hay suelo pintado) y, si se puede, sin paredes en medio desde el centro.
 */
export function makeSpotFinder(scene: Scene, items: BoardItem[], cx: number, cy: number) {
  const { widthCells: w, heightCells: h, gridSize: g } = scene;
  const taken = new Uint8Array(w * h);
  const terrain = /[^.]/.test(scene.terrain) ? normalizeTerrain(scene.terrain, w, h) : null;
  if (terrain) for (let i = 0; i < w * h; i++) if (isSolidCell(terrain[i])) taken[i] = 1;
  for (const it of items) {
    if (it.drawing || it.layer === 'map') continue;
    for (let y = Math.floor(it.y / g); y < Math.ceil((it.y + it.height) / g); y++)
      for (let x = Math.floor(it.x / g); x < Math.ceil((it.x + it.width) / g); x++) if (x >= 0 && y >= 0 && x < w && y < h) taken[y * w + x] = 1;
  }
  // Casillas de la escena ordenadas por cercanía al centro.
  const order = Array.from({ length: w * h }, (_, i) => i).sort((a, b) => Math.hypot((a % w) - cx, Math.floor(a / w) - cy) - Math.hypot((b % w) - cx, Math.floor(b / w) - cy));
  const center = { x: (cx + 0.5) * g, y: (cy + 0.5) * g };

  const fits = (x: number, y: number, size: number) => {
    if (x < 0 || y < 0 || x + size > w || y + size > h) return false;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (taken[(y + dy) * w + x + dx]) return false;
    return true;
  };

  return (size: number): { x: number; y: number } | null => {
    for (const strict of [true, false]) {
      for (const i of order) {
        const x = (i % w) - Math.floor((size - 1) / 2);
        const y = Math.floor(i / w) - Math.floor((size - 1) / 2);
        if (!fits(x, y, size)) continue;
        if (strict && scene.walls.length && !canMoveStraight(center, { x: (x + size / 2) * g, y: (y + size / 2) * g }, scene.walls)) continue;
        for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) taken[(y + dy) * w + x + dx] = 1;
        return { x, y };
      }
    }
    return null;
  };
}

/** Encuentros preparados de la partida: guardarlos y soltarlos en el tablero. Todo solo para el DM. */
export function createEncounterService(ctx: AppContext) {
  const { db } = ctx;
  const campaignsSvc = createCampaignService(ctx);
  const sheets = createSheetService(ctx);
  const board = createBoardService(ctx);

  function row(id: string, userId: string): Row {
    const r = db.select().from(encounters).where(eq(encounters.id, id)).get();
    if (!r || !campaignsSvc.getRole(r.campaignId, userId)) throw notFound('Encuentro no encontrado');
    campaignsSvc.requireGm(r.campaignId, userId);
    return r;
  }

  function checkMonsters(list: { monsterId: string }[] | undefined) {
    const unknown = list?.find((m) => !monsterById(m.monsterId));
    if (unknown) throw badRequest('Monstruo desconocido: {id}', { id: unknown.monsterId });
  }

  function list(campaignId: string, userId: string): Encounter[] {
    campaignsSvc.requireGm(campaignId, userId);
    return db.select().from(encounters).where(eq(encounters.campaignId, campaignId)).orderBy(asc(encounters.createdAt)).all().map(toEncounter);
  }

  function create(campaignId: string, userId: string, input: EncounterInput): Encounter {
    campaignsSvc.requireGm(campaignId, userId);
    const data = encounterInputSchema.parse(input);
    checkMonsters(data.monsters);
    const id = randomUUID();
    db.insert(encounters)
      .values({ id, campaignId, ...data })
      .run();
    return toEncounter(db.select().from(encounters).where(eq(encounters.id, id)).get()!);
  }

  function update(id: string, userId: string, input: UpdateEncounterInput): Encounter {
    row(id, userId);
    const data = updateEncounterSchema.parse(input);
    checkMonsters(data.monsters);
    if (Object.keys(data).length) db.update(encounters).set(data).where(eq(encounters.id, id)).run();
    return toEncounter(db.select().from(encounters).where(eq(encounters.id, id)).get()!);
  }

  function remove(id: string, userId: string): void {
    row(id, userId);
    db.delete(encounters).where(eq(encounters.id, id)).run();
  }

  /**
   * Suelta el encuentro en una escena de la partida: crea la hoja de cada monstruo (Goblin 1, Goblin 2…)
   * y su token con la IA activada, alrededor del punto pedido. Con `hidden`, en la capa del DM.
   */
  function deploy(id: string, userId: string, input: DeployEncounterInput): { scene: Scene; characters: Character[]; items: BoardItem[] } {
    const enc = row(id, userId);
    const { sceneId, x, y, hidden } = deployEncounterSchema.parse(input);
    const { scene, items } = board.itemsOf(sceneId);
    if (scene.campaignId !== enc.campaignId) throw notFound('Escena no encontrada');
    if (!enc.monsters.length) throw badRequest('El encuentro no tiene monstruos');
    const g = scene.gridSize;
    const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v / g)));
    const spot = makeSpotFinder(scene, items, clamp(x, scene.widthCells), clamp(y, scene.heightCells));

    // Primero se busca sitio para todos; si no caben, no se crea nada.
    const totals = new Map<string, number>();
    for (const m of enc.monsters) totals.set(m.monsterId, (totals.get(m.monsterId) ?? 0) + m.count);
    const numbered = new Map<string, number>();
    const plan = enc.monsters.flatMap((entry) => {
      const monster = monsterById(entry.monsterId);
      if (!monster) return [];
      return Array.from({ length: entry.count }, () => {
        const n = (numbered.get(monster.id) ?? 0) + 1;
        numbered.set(monster.id, n);
        const size = SIZE_CELLS[monster.size];
        const at = spot(size);
        if (!at) throw badRequest('No queda sitio libre en la escena para todos los monstruos');
        return { monster, size, at, name: (totals.get(monster.id) ?? 0) > 1 ? `${localName(monster)} ${n}` : localName(monster) };
      });
    });

    const characters: Character[] = [];
    const created: BoardItem[] = [];
    for (const { monster, size, at, name } of plan) {
      const character = sheets.createFromMonster(enc.campaignId, userId, monster.id, name);
      characters.push(character);
      const { item } = board.createItem(sceneId, userId, {
        layer: hidden ? 'gm' : 'token',
        x: at.x * g,
        y: at.y * g,
        width: size * g,
        height: size * g,
        name,
        showName: true,
        characterId: character.id,
        ai: monsterAi(monster),
      });
      created.push(item);
    }
    return { scene, characters, items: created };
  }

  return { list, create, update, remove, deploy };
}
