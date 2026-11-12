import { integer } from 'drizzle-orm/sqlite-core';
import { households } from './accounts.js';

export const LOCATIONS = ['fridge', 'freezer', 'pantry'] as const;
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Location = (typeof LOCATIONS)[number];
export type MealType = (typeof MEAL_TYPES)[number];

export const household = () =>
  integer('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });
