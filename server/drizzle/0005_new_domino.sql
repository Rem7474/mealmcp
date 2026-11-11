CREATE TABLE `shopping_item_meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shopping_item_id` integer NOT NULL,
	`meal_id` integer NOT NULL,
	`quantity` real,
	FOREIGN KEY (`shopping_item_id`) REFERENCES `shopping_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal_plan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `recipes` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `favorite` integer DEFAULT false NOT NULL;