import { integer } from 'drizzle-orm/sqlite-core';
import { households } from './accounts.js';

export const LOCATIONS = ['fridge', 'freezer', 'pantry'] as const;
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Location = (typeof LOCATIONS)[number];
export const DATE_KINDS = ['use_by', 'best_before'] as const;
export type DateKind = (typeof DATE_KINDS)[number];
export type MealType = (typeof MEAL_TYPES)[number];

export const household = () =>
  integer('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });
