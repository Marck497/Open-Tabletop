CREATE TABLE `scene_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scene_folders_campaign_idx` ON `scene_folders` (`campaign_id`);--> statement-breakpoint
ALTER TABLE `campaign_members` ADD `scene_id` text;--> statement-breakpoint
ALTER TABLE `scenes` ADD `folder_id` text;