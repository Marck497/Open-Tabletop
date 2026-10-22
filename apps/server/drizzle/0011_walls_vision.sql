ALTER TABLE `scenes` ADD `walls` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `scenes` ADD `vision` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scenes` ADD `vision_range` integer DEFAULT 0 NOT NULL;