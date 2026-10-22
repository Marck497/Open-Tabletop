import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import {
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  createCharacterSchema,
  defaultValues,
  monsterById,
  monsterValues,
  sheetTemplateSchema,
  updateCharacterSchema,
  type CampaignRole,
  type Character,
  type CreateCharacterInput,
  type SheetTemplate,
  type UpdateCharacterInput,
} from '@vtt/shared';
import type { AppContext } from '../../core/module.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { assets, boardItems, campaigns, characters, sheetTemplates } from '../../db/schema.js';
import { createCampaignService } from '../campaigns/service.js';

type CharacterRow = typeof characters.$inferSelect;
const toCharacter = ({ createdAt: _c, ...c }: CharacterRow): Character => c;

const MAX_VALUES_BYTES = 512 * 1024;

export function canSeeCharacter(c: Character, role: CampaignRole, userId: string): boolean {
  return role === 'gm' || c.visibleToAll || c.controlledBy.includes(userId);
}

export function canEditCharacter(c: Character, role: CampaignRole, userId: string): boolean {
  return role === 'gm' || c.controlledBy.includes(userId);
}

/** Plantillas de hoja (por partida) y personajes. */
export function createSheetService(ctx: AppContext) {
  const { db } = ctx;
  const campaignsSvc = createCampaignService(ctx);

  // ---------- Plantilla ----------

  function getTemplate(campaignId: string): SheetTemplate {
    const row = db.select().from(sheetTemplates).where(eq(sheetTemplates.campaignId, campaignId)).get();
    if (row) return row.definition;
    // Partidas sin plantilla todavía: se crea a partir del sistema de la partida.
    const c = db.select({ systemId: campaigns.systemId }).from(campaigns).where(eq(campaigns.id, campaignId)).get();
    if (!c) throw notFound('Partida no encontrada');
    const builtin = BUILTIN_TEMPLATES[c.systemId] ?? BUILTIN_TEMPLATES[DEFAULT_TEMPLATE_ID]!;
    db.insert(sheetTemplates).values({ campaignId, definition: builtin.template }).onConflictDoNothing().run();
    return builtin.template;
  }

  function templateFor(campaignId: string, userId: string): SheetTemplate {
    campaignsSvc.requireMember(campaignId, userId);
    return getTemplate(campaignId);
  }

  function saveTemplate(campaignId: string, userId: string, input: unknown): SheetTemplate {
    campaignsSvc.requireGm(campaignId, userId);
    const definition = sheetTemplateSchema.parse(input);
    const updatedAt = new Date().toISOString();
    db.insert(sheetTemplates)
      .values({ campaignId, definition, updatedAt })
      .onConflictDoUpdate({ target: sheetTemplates.campaignId, set: { definition, updatedAt } })
      .run();
    return definition;
  }

  function resetTemplate(campaignId: string, userId: string, builtinId: string): SheetTemplate {
    const builtin = BUILTIN_TEMPLATES[builtinId];
    if (!builtin) throw badRequest('Plantilla desconocida');
    const t = saveTemplate(campaignId, userId, builtin.template);
    db.update(campaigns).set({ systemId: builtinId }).where(eq(campaigns.id, campaignId)).run();
    return t;
  }

  // ---------- Personajes ----------

  function row(characterId: string): Character {
    const r = db.select().from(characters).where(eq(characters.id, characterId)).get();
    if (!r) throw notFound('Personaje no encontrado');
    return toCharacter(r);
  }

  /** Personaje + rol del usuario, comprobando que puede verlo. */
  function access(characterId: string, userId: string): { character: Character; role: CampaignRole } {
    const character = row(characterId);
    const role = campaignsSvc.getRole(character.campaignId, userId);
    if (!role || !canSeeCharacter(character, role, userId)) throw notFound('Personaje no encontrado');
    return { character, role };
  }

  function list(campaignId: string, userId: string): Character[] {
    const role = campaignsSvc.requireMember(campaignId, userId);
    return db
      .select()
      .from(characters)
      .where(eq(characters.campaignId, campaignId))
      .orderBy(asc(characters.name))
      .all()
      .map(toCharacter)
      .filter((c) => canSeeCharacter(c, role, userId));
  }

  function validMembers(campaignId: string, ids: string[]): string[] {
    return [...new Set(ids)].filter((id) => campaignsSvc.getRole(campaignId, id));
  }

  /** El DM crea cualquier personaje; un jugador, solo uno que controle él. */
  function create(campaignId: string, userId: string, input: CreateCharacterInput): Character {
    const role = campaignsSvc.requireMember(campaignId, userId);
    const data = createCharacterSchema.parse(input);
    const controlledBy = role === 'gm' ? validMembers(campaignId, data.controlledBy) : [userId];
    const id = randomUUID();
    db.insert(characters)
      .values({
        id,
        campaignId,
        name: data.name,
        controlledBy,
        visibleToAll: role === 'gm' ? data.visibleToAll : false,
        values: defaultValues(getTemplate(campaignId)),
      })
      .run();
    return row(id);
  }

  function update(characterId: string, userId: string, input: UpdateCharacterInput): { before: Character; after: Character; role: CampaignRole } {
    const { character: before, role } = access(characterId, userId);
    if (!canEditCharacter(before, role, userId)) throw forbidden('No puedes editar este personaje');
    const data = updateCharacterSchema.parse(input);
    if (role !== 'gm' && (data.controlledBy !== undefined || data.visibleToAll !== undefined)) {
      throw forbidden('Solo el DM puede cambiar quién controla o ve el personaje');
    }
    if (data.avatarAssetId) {
      const a = db.select({ campaignId: assets.campaignId }).from(assets).where(eq(assets.id, data.avatarAssetId)).get();
      if (a?.campaignId !== before.campaignId) throw badRequest('Imagen no válida');
    }
    const values = data.values ? { ...before.values, ...data.values } : undefined;
    if (values && JSON.stringify(values).length > MAX_VALUES_BYTES) throw badRequest('La hoja es demasiado grande');

    db.update(characters)
      .set({
        name: data.name,
        avatarAssetId: data.avatarAssetId,
        controlledBy: data.controlledBy ? validMembers(before.campaignId, data.controlledBy) : undefined,
        visibleToAll: data.visibleToAll,
        values,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(characters.id, characterId))
      .run();
    return { before, after: row(characterId), role };
  }

  function remove(characterId: string, userId: string): Character {
    const { character, role } = access(characterId, userId);
    if (role !== 'gm') throw forbidden('Solo el DM puede borrar personajes');
    db.transaction((tx) => {
      tx.update(boardItems).set({ characterId: null }).where(eq(boardItems.characterId, characterId)).run();
      tx.delete(characters).where(eq(characters.id, characterId)).run();
    });
    return character;
  }

  /** El DM añade un monstruo del compendio: un PNJ con la hoja ya rellena. */
  function createFromMonster(campaignId: string, userId: string, monsterId: string, name?: string): Character {
    campaignsSvc.requireGm(campaignId, userId);
    const monster = monsterById(monsterId);
    if (!monster) throw notFound('Monstruo no encontrado');
    const character = create(campaignId, userId, { name: name?.trim() || monster.name });
    return update(character.id, userId, { values: monsterValues(getTemplate(campaignId), monster) }).after;
  }

  return { getTemplate, templateFor, saveTemplate, resetTemplate, list, access, create, update, remove, row, createFromMonster };
}

export type SheetService = ReturnType<typeof createSheetService>;
