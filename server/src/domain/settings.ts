import { z } from 'zod';
import { MEAL_TYPES } from '../db/schema.js';
import { ALLERGENS, DIETS } from './diet.js';
import { COUNTRIES, HEMISPHERES } from './seasons.js';

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
  country: z
    .enum(COUNTRIES)
    .optional()
    .describe('Where the household lives (FR, BE, CH, GB, CA, US): picks the seasonal produce calendar. Defaults to FR.'),
  hemisphere: z
    .enum(HEMISPHERES)
    .optional()
    .describe('"south" shifts the seasonal calendar by six months (e.g. for a household in the southern hemisphere). Defaults to north.'),
  diet: z
    .object({
      diets: z.array(z.enum(DIETS)).max(DIETS.length).optional().describe('Diets the household follows; recipes with ingredients that break them are flagged and not suggested.'),
      allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).optional().describe('Allergens to avoid (EU list). Matching is by ingredient name, so verify labels: this is a safety net, not a guarantee.'),
      avoid: z.array(z.string().trim().min(1).max(60)).max(50).optional().describe('Ingredient names the household does not want (dislikes, intolerances), e.g. ["coriander", "olives"].'),
    })
    .optional()
    .describe('Dietary restrictions, allergies and dislikes of the household. Replaces the whole object when given.'),
  nutrition: z
    .object({ enabled: z.boolean().describe('Turns the nutrition module on') })
    .optional()
    .describe('Optional nutrition module (off by default). When on, product values can be looked up on Open Food Facts (only a product name or barcode is sent) or typed by hand, and recipes and meals get calories and macros.'),
  shoppingGroupBy: z
    .enum(['none', 'aisle', 'meal'])
    .optional()
    .describe('How the shopping list is organised in the web UI: one flat list, by store aisle, or by the meal each item is for.'),
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
