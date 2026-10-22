CREATE TABLE `macros` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`command` text NOT NULL,
	`character_id` text,
	`in_bar` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `macros_campaign_idx` ON `macros` (`campaign_id`);