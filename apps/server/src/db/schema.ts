import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { BoardLayer, Fog } from '@vtt/shared';

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
    sortOrder: integer('sort_order').notNull().default(0),
    fog: text('fog', { mode: 'json' }).$type<Fog>().notNull().default({ enabled: false, ops: [] }),
    ...timestamps,
  },
  (t) => [index('scenes_campaign_idx').on(t.campaignId)],
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
    ...timestamps,
  },
  (t) => [index('board_items_scene_idx').on(t.sceneId)],
);
