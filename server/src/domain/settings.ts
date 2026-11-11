import { z } from 'zod';
import { MEAL_TYPES } from '../db/schema.js';

const weekday = z.number().int().min(0).max(6);

/**
 * Household preferences that make planning less manual. Stored as JSON on the household.
 * Weekdays follow JavaScript: 0 = Sunday ... 6 = Saturday.
 */
export const householdSettings = z.object({
  defaultServings: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('How many people eat by default (e.g. 1). Planned meals are scaled to it unless a number of servings is given.'),
  plannedMeals: z
    .record(z.enum(MEAL_TYPES), z.array(weekday))
    .optional()
    .describe('Which meals are expected on which weekdays, e.g. {"dinner": [0,1,2,3,4]} for dinners from Sunday to Thursday (0 = Sunday).'),
});

export type HouseholdSettings = z.infer<typeof householdSettings>;

export function parseSettings(json: string): HouseholdSettings {
  try {
    const parsed = householdSettings.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
