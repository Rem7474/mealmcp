CREATE INDEX `auth_codes_user_idx` ON `auth_codes` (`user_id`);--> statement-breakpoint
CREATE INDEX `invites_household_idx` ON `invites` (`household_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_access_idx` ON `refresh_tokens` (`access_token_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `users_household_idx` ON `users` (`household_id`);--> statement-breakpoint
CREATE INDEX `expense_items_expense_idx` ON `expense_items` (`expense_id`);--> statement-breakpoint
CREATE INDEX `expense_items_product_idx` ON `expense_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `price_obs_expense_idx` ON `price_observations` (`expense_id`);--> statement-breakpoint
CREATE INDEX `product_aliases_product_idx` ON `product_aliases` (`product_id`);--> statement-breakpoint
CREATE INDEX `stock_household_product_idx` ON `stock_items` (`household_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `meal_plan_recipe_idx` ON `meal_plan` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `shopping_item_meals_item_idx` ON `shopping_item_meals` (`shopping_item_id`);--> statement-breakpoint
CREATE INDEX `shopping_item_meals_meal_idx` ON `shopping_item_meals` (`meal_id`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_product_idx` ON `recipe_ingredients` (`product_id`);--> statement-breakpoint
CREATE INDEX `recipe_steps_recipe_idx` ON `recipe_steps` (`recipe_id`);