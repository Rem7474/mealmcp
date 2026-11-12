import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { household } from './common.js';
import { products } from './pantry.js';

// Recipes, their ingredients and steps, and the appliances they need.

export const recipes = sqliteTable(
  'recipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    name: text('name').notNull(),
    description: text('description'),
    servings: integer('servings').notNull().default(4),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    instructions: text('instructions'),
    /** Household's own verdict, 1 to 5 stars (null = not rated yet). */
    rating: integer('rating'),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('recipes_household_idx').on(t.householdId)],
);

/** Appliances (air fryer, oven) and utensils (whisk, mandoline) the household has, or a recipe asks for. */
export const equipment = sqliteTable(
  'equipment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    name: text('name').notNull(),
    /** Lower-cased name used for case-insensitive lookups. */
    nameKey: text('name_key').notNull(),
    kind: text('kind', { enum: ['appliance', 'utensil'] })
      .notNull()
      .default('utensil'),
    /** False when a recipe mentions it but the household does not have it (yet). */
    owned: integer('owned', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('equipment_household_name_idx').on(t.householdId, t.nameKey)],
);

/** What a recipe needs besides ingredients. */
export const recipeEquipment = sqliteTable(
  'recipe_equipment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    equipmentId: integer('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('recipe_equipment_unique_idx').on(t.recipeId, t.equipmentId)],
);

/** Free-form labels such as "air fryer", "quick" or "no shopping". Lower-cased. */
export const recipeTags = sqliteTable(
  'recipe_tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => [uniqueIndex('recipe_tags_unique_idx').on(t.recipeId, t.tag)],
);

/** Ordered, structured steps: enough for a machine to start the right program (appliance, °C, minutes). */
export const recipeSteps = sqliteTable('recipe_steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  text: text('text').notNull(),
  durationMinutes: integer('duration_minutes'),
  temperatureC: integer('temperature_c'),
  appliance: text('appliance'),
});

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
  note: text('note'),
  /** "To taste" (pepper, thyme): listed in the recipe but not counted, bought or priced. */
  toTaste: integer('to_taste', { mode: 'boolean' }).notNull().default(false),
});
