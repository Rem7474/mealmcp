CREATE TABLE `price_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`unit_price` real NOT NULL,
	`price_unit` text NOT NULL,
	`date` text NOT NULL,
	`store` text,
	`source` text NOT NULL,
	`expense_id` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `price_obs_product_idx` ON `price_observations` (`household_id`,`product_id`,`date`);--> statement-breakpoint
INSERT INTO `price_observations` (`household_id`, `product_id`, `unit_price`, `price_unit`, `date`, `store`, `source`, `expense_id`)
SELECT e.`household_id`, ei.`product_id`, ei.`price_cents` * 1.0 / ei.`quantity`, ei.`unit`, e.`date`, e.`store`, 'receipt', e.`id`
FROM `expense_items` ei JOIN `expenses` e ON e.`id` = ei.`expense_id`
WHERE ei.`product_id` IS NOT NULL AND ei.`quantity` > 0 AND ei.`unit` IS NOT NULL AND ei.`price_cents` > 0;
--> statement-breakpoint
INSERT INTO `price_observations` (`household_id`, `product_id`, `unit_price`, `price_unit`, `date`, `store`, `source`, `expense_id`)
SELECT p.`household_id`, p.`id`, p.`unit_price`, p.`price_unit`, date('now'), NULL, 'manual', NULL
FROM `products` p
WHERE p.`unit_price` IS NOT NULL AND p.`price_unit` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `price_observations` o WHERE o.`product_id` = p.`id`);
