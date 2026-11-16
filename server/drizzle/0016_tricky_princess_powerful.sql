CREATE TABLE `product_barcodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`code` text NOT NULL,
	`brand` text,
	`pack_size` real,
	`unit` text,
	`label` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_barcodes_household_code_idx` ON `product_barcodes` (`household_id`,`code`);--> statement-breakpoint
CREATE INDEX `product_barcodes_product_idx` ON `product_barcodes` (`product_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `product_barcodes` (`household_id`, `product_id`, `code`, `brand`)
SELECT `household_id`, `id`,
  CASE
    WHEN length(`barcode`) BETWEEN 9 AND 12 THEN substr('0000000000000' || `barcode`, -13)
    WHEN length(`barcode`) = 14 AND `barcode` LIKE '0%' THEN substr(`barcode`, 2)
    ELSE `barcode`
  END,
  `brand`
FROM `products`
WHERE `barcode` IS NOT NULL AND length(`barcode`) BETWEEN 6 AND 14 AND `barcode` NOT GLOB '*[^0-9]*'
ORDER BY `id`;
