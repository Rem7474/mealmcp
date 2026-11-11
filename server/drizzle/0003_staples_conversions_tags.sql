CREATE TABLE `product_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`alias` text NOT NULL,
	`alias_key` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_aliases_household_key_idx` ON `product_aliases` (`household_id`,`alias_key`);--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`duration_minutes` integer,
	`temperature_c` integer,
	`appliance` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_tags_unique_idx` ON `recipe_tags` (`recipe_id`,`tag`);--> statement-breakpoint
ALTER TABLE `households` ADD `settings` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `is_staple` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `grams_per_piece` real;--> statement-breakpoint
ALTER TABLE `products` ADD `grams_per_ml` real;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD `to_taste` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `cook_minutes` integer;--> statement-breakpoint
ALTER TABLE `stock_items` ADD `approximate` integer DEFAULT false NOT NULL;