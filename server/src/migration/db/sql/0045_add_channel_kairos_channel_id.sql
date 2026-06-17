ALTER TABLE `channel` ADD `kairos_channel_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `channel_kairos_channel_id_unique` ON `channel` (`kairos_channel_id`);