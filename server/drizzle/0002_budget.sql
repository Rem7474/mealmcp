CREATE TABLE `expense_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expense_id` integer NOT NULL,
	`product_id` integer,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`price_cents` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`date` text NOT NULL,
	`store` text,
	`note` text,
	`total_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expenses_household_date_idx` ON `expenses` (`household_id`,`date`);--> statement-breakpoint
ALTER TABLE `households` ADD `currency` text DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `monthly_budget_cents` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `unit_price` real;--> statement-breakpoint
ALTER TABLE `products` ADD `price_unit` text;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `price_cents` integer;