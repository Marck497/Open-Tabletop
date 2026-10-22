CREATE TABLE `jukebox` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`tracks` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
