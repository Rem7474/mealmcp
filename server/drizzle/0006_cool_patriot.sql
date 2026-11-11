ALTER TABLE `products` ADD `drained_ratio` real;--> statement-breakpoint
ALTER TABLE `products` ADD `opened_shelf_life_days` integer;--> statement-breakpoint
ALTER TABLE `stock_items` ADD `pack_size` real;--> statement-breakpoint
ALTER TABLE `stock_items` ADD `opened_on` text;