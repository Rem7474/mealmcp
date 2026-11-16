ALTER TABLE `products` ADD `frozen_shelf_life_days` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `thawed_shelf_life_days` integer;--> statement-breakpoint
ALTER TABLE `stock_items` ADD `frozen_on` text;--> statement-breakpoint
ALTER TABLE `stock_items` ADD `thawed_on` text;