import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { household, MEAL_TYPES } from './common.js';
import { products } from './pantry.js';
import { recipes } from './recipes.js';

// The meal plan and the shopping list built from it.

export const mealPlan = sqliteTable(
  'meal_plan',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    /** ISO date YYYY-MM-DD. */
    date: text('date').notNull(),
    mealType: text('meal_type', { enum: MEAL_TYPES }).notNull(),
    recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }),
    /** Free text for meals without a recipe (e.g. "Restaurant"). */
    title: text('title'),
    servings: integer('servings').notNull().default(4),
    cooked: integer('cooked', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('meal_plan_household_date_idx').on(t.householdId, t.date)],
);

/** Which planned meals a generated shopping line is for (a line can serve several meals). */
export const shoppingItemMeals = sqliteTable('shopping_item_meals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  shoppingItemId: integer('shopping_item_id')
    .notNull()
    .references(() => shoppingItems.id, { onDelete: 'cascade' }),
  mealId: integer('meal_id')
    .notNull()
    .references(() => mealPlan.id, { onDelete: 'cascade' }),
  /** Share of the line attributed to this meal, in the line's unit. */
  quantity: real('quantity'),
});

export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: real('quantity'),
    unit: text('unit').notNull(),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    /** 'manual' = added by a person/AI, 'plan' = generated from the meal plan. */
    source: text('source', { enum: ['manual', 'plan'] })
      .notNull()
      .default('manual'),
    /** What this line cost (or is expected to cost), in cents. Entered while shopping. */
    priceCents: integer('price_cents'),
  },
  (t) => [index('shopping_household_idx').on(t.householdId)],
);
