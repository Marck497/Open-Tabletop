ALTER TABLE `scenes` ADD `cell_distance` real DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `scenes` ADD `distance_unit` text DEFAULT 'pies' NOT NULL;--> statement-breakpoint
ALTER TABLE `scenes` ADD `diagonal_rule` text DEFAULT '5e' NOT NULL;