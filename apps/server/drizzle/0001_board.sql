CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`uploader_id` text,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`path` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assets_campaign_idx` ON `assets` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `board_items` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`layer` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`rotation` real DEFAULT 0 NOT NULL,
	`z` integer DEFAULT 0 NOT NULL,
	`asset_id` text,
	`color` text DEFAULT '#b0413e' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`show_name` integer DEFAULT false NOT NULL,
	`owner_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `board_items_scene_idx` ON `board_items` (`scene_id`);--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`width_cells` integer DEFAULT 30 NOT NULL,
	`height_cells` integer DEFAULT 20 NOT NULL,
	`grid_size` integer DEFAULT 70 NOT NULL,
	`grid_visible` integer DEFAULT true NOT NULL,
	`grid_color` text DEFAULT 'rgba(255,255,255,0.18)' NOT NULL,
	`background_color` text DEFAULT '#2b2a30' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`fog` text DEFAULT '{"enabled":false,"ops":[]}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenes_campaign_idx` ON `scenes` (`campaign_id`);--> statement-breakpoint
ALTER TABLE `campaigns` ADD `active_scene_id` text;