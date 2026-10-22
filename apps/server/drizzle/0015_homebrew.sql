CREATE TABLE `homebrew` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `homebrew_campaign_idx` ON `homebrew` (`campaign_id`);