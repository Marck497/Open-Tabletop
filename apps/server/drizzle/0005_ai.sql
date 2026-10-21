ALTER TABLE `board_items` ADD `ai` text;--> statement-breakpoint
ALTER TABLE `initiative` ADD `ai` text DEFAULT '{"auto":false,"applyDamage":true}' NOT NULL;