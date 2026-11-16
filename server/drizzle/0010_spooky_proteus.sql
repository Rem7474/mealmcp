ALTER TABLE `stock_items` ADD `printed_expires_on` text;
--> statement-breakpoint
UPDATE `stock_items` SET `printed_expires_on` = `expires_on` WHERE `opened_on` IS NULL AND `expires_on` IS NOT NULL;
