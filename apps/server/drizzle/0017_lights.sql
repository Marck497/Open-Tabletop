ALTER TABLE `board_items` ADD `light` text;--> statement-breakpoint
ALTER TABLE `board_items` ADD `darkvision` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenes` ADD `lighting` integer DEFAULT false NOT NULL;