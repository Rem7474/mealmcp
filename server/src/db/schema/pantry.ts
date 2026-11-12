import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { household, LOCATIONS } from './common.js';

// Products and what is at home: stock lines and what was thrown away.

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    name: text('name').notNull(),
    /** Lower-cased name used for case-insensitive lookups. */
    nameKey: text('name_key').notNull(),
    category: text('category'),
    // The DDL default is legacy and never used (the app always sets the unit, see DEFAULT_UNIT).
    // It is left as is: changing a SQLite default makes drizzle recreate the table, which would
    // cascade-delete every row that references it while foreign keys are on.
    defaultUnit: text('default_unit').notNull().default('pièce'),
    /** Alert threshold, expressed in defaultUnit. */
    minStock: real('min_stock'),
    /** Last known price in cents per 1 `priceUnit` (g, ml, piece, ...). Null until a price is recorded. */
    unitPrice: real('unit_price'),
    priceUnit: text('price_unit'),
    /** Always at home (oil, salt, pepper...): kept in recipes but never bought, counted or used up. */
    isStaple: integer('is_staple', { mode: 'boolean' }).notNull().default(false),
    /** Conversions that let g, ml and pieces be compared: 1 piece weighs this many grams... */
    gramsPerPiece: real('grams_per_piece'),
    /** ...and 1 ml weighs this many grams (density). */
    gramsPerMl: real('grams_per_ml'),
    /** Drained weight / net (label) weight, e.g. 125/200 for beans: recipes talk drained grams, stock holds net grams. */
    drainedRatio: real('drained_ratio'),
    /** Days an opened pack keeps (sauce 3, coconut milk 4): sets the expiry when a pack is opened. */
    openedShelfLifeDays: integer('opened_shelf_life_days'),
    /** JSON array of allergen keys that overrides the name-based guess (null = guess, [] = none). */
    allergens: text('allergens'),
    /** JSON ProductNutrition (values per 100 g and where they come from); null until set. */
    nutrition: text('nutrition'),
  },
  (t) => [uniqueIndex('products_household_name_idx').on(t.householdId, t.nameKey)],
);

/** Other names a product goes by, e.g. the wording on a receipt. Lower-cased and unique per household. */
export const productAliases = sqliteTable(
  'product_aliases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    aliasKey: text('alias_key').notNull(),
  },
  (t) => [uniqueIndex('product_aliases_household_key_idx').on(t.householdId, t.aliasKey)],
);

export const stockItems = sqliteTable(
  'stock_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    location: text('location', { enum: LOCATIONS }).notNull().default('pantry'),
    /** ISO date YYYY-MM-DD. */
    expiresOn: text('expires_on'),
    addedOn: text('added_on').notNull(),
    /** "There is some, amount unknown" (plenty of pasta): counts as available, never used up by cooking. */
    approximate: integer('approximate', { mode: 'boolean' }).notNull().default(false),
    /** Size of one pack, in `unit` (3 cartons of 200 ml: quantity 600, packSize 200). Null when not bought in packs. */
    packSize: real('pack_size'),
    /** Set once a pack is opened (then `quantity` is what is left of that single pack). ISO date. */
    openedOn: text('opened_on'),
  },
  (t) => [index('stock_household_idx').on(t.householdId)],
);

export const wasteLog = sqliteTable(
  'waste_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    /** Estimated value in cents from the last known product price; null when unpriced. */
    costCents: integer('cost_cents'),
    reason: text('reason', { enum: ['expired', 'spoiled', 'leftover', 'other'] })
      .notNull()
      .default('expired'),
    date: text('date').notNull(),
  },
  (t) => [index('waste_log_household_date_idx').on(t.householdId, t.date)],
);
