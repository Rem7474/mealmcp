-- The base unit for countable items is now "piece" (it used to be the French "pièce").
UPDATE `products` SET `default_unit` = 'piece' WHERE `default_unit` = 'pièce';--> statement-breakpoint
UPDATE `stock_items` SET `unit` = 'piece' WHERE `unit` = 'pièce';--> statement-breakpoint
UPDATE `recipe_ingredients` SET `unit` = 'piece' WHERE `unit` = 'pièce';--> statement-breakpoint
UPDATE `shopping_items` SET `unit` = 'piece' WHERE `unit` = 'pièce';
