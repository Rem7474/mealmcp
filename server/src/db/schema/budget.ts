import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { household } from './common.js';
import { products } from './pantry.js';

// Purchases and their receipt lines.

export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    /** ISO date YYYY-MM-DD. */
    date: text('date').notNull(),
    store: text('store'),
    note: text('note'),
    totalCents: integer('total_cents').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('expenses_household_date_idx').on(t.householdId, t.date)],
);

export const expenseItems = sqliteTable('expense_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  expenseId: integer('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'cascade' }),
  /** Kept when the product is deleted, so history stays readable. */
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  /** Line total in cents. */
  priceCents: integer('price_cents').notNull(),
});

export const PRICE_SOURCES = ['receipt', 'manual'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

/**
 * Every price seen for a product, as cents per 1 `priceUnit` (g, ml, piece). `products.unitPrice` is the latest of
 * them; the history lets trends and shop comparisons be computed. Deleting an expense keeps what it taught.
 */
export const priceObservations = sqliteTable(
  'price_observations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    unitPrice: real('unit_price').notNull(),
    priceUnit: text('price_unit').notNull(),
    /** ISO date YYYY-MM-DD. */
    date: text('date').notNull(),
    store: text('store'),
    source: text('source', { enum: PRICE_SOURCES }).notNull(),
    expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
  },
  (t) => [index('price_obs_product_idx').on(t.householdId, t.productId, t.date)],
);
