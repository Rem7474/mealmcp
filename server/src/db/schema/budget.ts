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
