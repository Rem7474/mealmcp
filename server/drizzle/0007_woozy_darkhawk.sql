CREATE TABLE `waste_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`cost_cents` integer,
	`reason` text DEFAULT 'expired' NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `waste_log_household_date_idx` ON `waste_log` (`household_id`,`date`);--> statement-breakpoint
ALTER TABLE `products` ADD `allergens` text;