import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { households, users } from './accounts.js';

/**
 * Something a person is asked to review before anything is written: a week menu, a shopping trip to record.
 * The payload is JSON and is never trusted at apply time (every id and quantity is checked again).
 * Rows expire by themselves; timestamps are epoch milliseconds.
 */
export const proposals = sqliteTable(
  'proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: integer('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: ['week_plan', 'purchase', 'recipe'] }).notNull(),
    /** `rules` for the deterministic path, `llm` when a model produced the content. */
    source: text('source', { enum: ['rules', 'llm'] }).notNull(),
    status: text('status', { enum: ['pending', 'applied'] })
      .notNull()
      .default('pending'),
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('proposals_household_idx').on(t.householdId, t.kind)],
);
