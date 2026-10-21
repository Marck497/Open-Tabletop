CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text,
	`user_name` text NOT NULL,
	`character_id` text,
	`character_name` text,
	`kind` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`roll` text,
	`whisper_to` text,
	`secret` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_campaign_created_idx` ON `chat_messages` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `initiative` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`entries` text DEFAULT '[]' NOT NULL,
	`turn` integer DEFAULT 0 NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
