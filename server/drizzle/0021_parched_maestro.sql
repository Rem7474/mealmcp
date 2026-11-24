ALTER TABLE `products` ADD `buy_pack_size` real;--> statement-breakpoint
ALTER TABLE `products` ADD `buy_pack_unit` text;--> statement-breakpoint
ALTER TABLE `products` ADD `buy_loose` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `default_location` text;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `needed_quantity` real;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `location` text;