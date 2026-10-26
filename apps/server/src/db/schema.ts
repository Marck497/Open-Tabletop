import { sql } from 'drizzle-orm';
import { blob, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AiSettings, BoardLayer, Drawing, EncounterMonster, HomebrewData, JukeboxTrack, ChatRoll, TokenAi, Fog, InitiativeEntry, Light, SheetTemplate, SheetValues, Wall } from '@vtt/shared';

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

export const sessions = sqliteTable('sessions', {
  /** Hash SHA-256 del token de la cookie (el token en claro nunca se guarda). */
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ...timestamps,
});

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** Identificador del sistema de juego (plantilla de reglas/hojas), p. ej. "dnd5e". */
  systemId: text('system_id').notNull().default('dnd5e'),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  inviteCode: text('invite_code').notNull().unique(),
  /** Escena donde están los jugadores. Sin FK para evitar el ciclo campaigns <-> scenes. */
  activeSceneId: text('active_scene_id'),
  ...timestamps,
});

export const campaignMembers = sqliteTable(
  'campaign_members',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['gm', 'player'] }).notNull(),
    /** Escena aparte a la que el DM ha llevado a este jugador (null = la de la party). Sin FK, como activeSceneId. */
    sceneId: text('scene_id'),
    joinedAt: text('joined_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    /** Ruta relativa dentro de DATA_DIR/uploads. */
    path: text('path').notNull(),
    ...timestamps,
  },
  (t) => [index('assets_campaign_idx').on(t.campaignId)],
);

export const scenes = sqliteTable(
  'scenes',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    widthCells: integer('width_cells').notNull().default(30),
    heightCells: integer('height_cells').notNull().default(20),
    gridSize: integer('grid_size').notNull().default(70),
    gridVisible: integer('grid_visible', { mode: 'boolean' }).notNull().default(true),
    gridColor: text('grid_color').notNull().default('rgba(255,255,255,0.18)'),
    backgroundColor: text('background_color').notNull().default('#2b2a30'),
    cellDistance: real('cell_distance').notNull().default(5),
    distanceUnit: text('distance_unit').notNull().default('pies'),
    diagonalRule: text('diagonal_rule', { enum: ['5e', 'alt', 'euclid'] }).notNull().default('5e'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Carpeta en la lista del DM. Sin FK: si se borra la carpeta, la escena sube de nivel. */
    folderId: text('folder_id'),
    fog: text('fog', { mode: 'json' }).$type<Fog>().notNull().default({ enabled: false, ops: [] }),
    walls: text('walls', { mode: 'json' }).$type<Wall[]>().notNull().default([]),
    terrain: text('terrain').notNull().default(''),
    vision: integer('vision', { mode: 'boolean' }).notNull().default(false),
    visionRange: integer('vision_range').notNull().default(0),
    exploration: integer('exploration', { mode: 'boolean' }).notNull().default(true),
    explored: text('explored').notNull().default(''),
    lighting: integer('lighting', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index('scenes_campaign_idx').on(t.campaignId)],
);

/** Carpetas de la lista de escenas (se pueden anidar). */
export const sceneFolders = sqliteTable(
  'scene_folders',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('scene_folders_campaign_idx').on(t.campaignId)],
);

export const boardItems = sqliteTable(
  'board_items',
  {
    id: text('id').primaryKey(),
    sceneId: text('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    layer: text('layer').$type<BoardLayer>().notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    width: real('width').notNull(),
    height: real('height').notNull(),
    rotation: real('rotation').notNull().default(0),
    z: integer('z').notNull().default(0),
    assetId: text('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    color: text('color').notNull().default('#b0413e'),
    name: text('name').notNull().default(''),
    showName: integer('show_name', { mode: 'boolean' }).notNull().default(false),
    ownerIds: text('owner_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    characterId: text('character_id').references(() => characters.id, { onDelete: 'set null' }),
    ai: text('ai', { mode: 'json' }).$type<TokenAi>(),
    statuses: text('statuses', { mode: 'json' }).$type<string[]>().notNull().default([]),
    statusRounds: text('status_rounds', { mode: 'json' }).$type<Record<string, number>>().notNull().default({}),
    hpView: text('hp_view', { enum: ['gm', 'bar', 'numbers'] }),
    acView: text('ac_view', { enum: ['gm', 'all'] }),
    drawing: text('drawing', { mode: 'json' }).$type<Drawing>(),
    light: text('light', { mode: 'json' }).$type<Light>(),
    darkvision: real('darkvision').notNull().default(0),
    gmNotes: text('gm_notes').notNull().default(''),
    ...timestamps,
  },
  (t) => [index('board_items_scene_idx').on(t.sceneId)],
);

/** Plantilla de hoja de cada partida (editable por el DM). */
export const sheetTemplates = sqliteTable('sheet_templates', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  definition: text('definition', { mode: 'json' }).$type<SheetTemplate>().notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const characters = sqliteTable(
  'characters',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    avatarAssetId: text('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    controlledBy: text('controlled_by', { mode: 'json' }).$type<string[]>().notNull().default([]),
    visibleToAll: integer('visible_to_all', { mode: 'boolean' }).notNull().default(false),
    values: text('values', { mode: 'json' }).$type<SheetValues>().notNull().default({}),
    ...timestamps,
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index('characters_campaign_idx').on(t.campaignId)],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Copia del nombre al enviar: el historial no cambia si alguien se renombra. */
    userName: text('user_name').notNull(),
    characterId: text('character_id'),
    characterName: text('character_name'),
    kind: text('kind', { enum: ['text', 'emote', 'roll', 'system'] }).notNull(),
    text: text('text').notNull().default(''),
    roll: text('roll', { mode: 'json' }).$type<ChatRoll>(),
    whisperTo: text('whisper_to', { mode: 'json' }).$type<string[]>(),
    secret: integer('secret', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index('chat_campaign_created_idx').on(t.campaignId, t.createdAt)],
);

export const initiative = sqliteTable('initiative', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  entries: text('entries', { mode: 'json' }).$type<InitiativeEntry[]>().notNull().default([]),
  turn: integer('turn').notNull().default(0),
  round: integer('round').notNull().default(1),
  active: integer('active', { mode: 'boolean' }).notNull().default(false),
  ai: text('ai', { mode: 'json' }).$type<AiSettings>().notNull().default({ auto: false, applyDamage: true }),
});

export const handouts = sqliteTable(
  'handouts',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    imageAssetId: text('image_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    gmNotes: text('gm_notes').notNull().default(''),
    visibleToAll: integer('visible_to_all', { mode: 'boolean' }).notNull().default(false),
    sharedWith: text('shared_with', { mode: 'json' }).$type<string[]>().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index('handouts_campaign_idx').on(t.campaignId)],
);

export const macros = sqliteTable(
  'macros',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shared: integer('shared', { mode: 'boolean' }).notNull().default(false),
    name: text('name').notNull(),
    command: text('command').notNull(),
    characterId: text('character_id').references(() => characters.id, { onDelete: 'set null' }),
    inBar: integer('in_bar', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('macros_campaign_idx').on(t.campaignId)],
);

/** Creaciones de la mesa: hechizos, ataques y objetos (los datos van en JSON). */
export const homebrew = sqliteTable(
  'homebrew',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shared: integer('shared', { mode: 'boolean' }).notNull().default(false),
    kind: text('kind', { enum: ['spell', 'attack', 'item'] }).notNull(),
    name: text('name').notNull(),
    data: text('data', { mode: 'json' }).$type<HomebrewData>().notNull(),
    ...timestamps,
    updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index('homebrew_campaign_idx').on(t.campaignId)],
);

export const jukebox = sqliteTable('jukebox', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  tracks: text('tracks', { mode: 'json' }).$type<JukeboxTrack[]>().notNull().default([]),
});

/** Biblioteca de escenas de cada usuario: escenas guardadas para usarlas en cualquiera de sus partidas. */
export const sceneLibrary = sqliteTable(
  'scene_library',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    widthCells: integer('width_cells').notNull(),
    heightCells: integer('height_cells').notNull(),
    itemCount: integer('item_count').notNull().default(0),
    /** La escena empaquetada (ScenePackage en JSON con gzip, imágenes incluidas). */
    data: blob('data', { mode: 'buffer' }).notNull(),
    ...timestamps,
  },
  (t) => [index('scene_library_user_idx').on(t.userId)],
);

/** Encuentros preparados de cada partida (grupos de monstruos del compendio). Solo los ve el DM. */
export const encounters = sqliteTable(
  'encounters',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    notes: text('notes').notNull().default(''),
    monsters: text('monsters', { mode: 'json' }).$type<EncounterMonster[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index('encounters_campaign_idx').on(t.campaignId)],
);
