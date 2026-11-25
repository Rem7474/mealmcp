import { z } from 'zod';
import { MEAL_TYPES } from '../../db/schema.js';
import { id, isoDate } from './shared.js';

export const planList = z.object({
  from: isoDate.describe('First day, inclusive'),
  to: isoDate.describe('Last day, inclusive'),
});

export const planAdd = z.object({
  date: isoDate,
  mealType: z.enum(MEAL_TYPES),
  recipeId: id.nullable().optional().describe('Recipe to cook; omit for a free-text meal'),
  title: z.string().max(160).nullable().optional().describe('Free text when there is no recipe, e.g. "Restaurant"'),
  servings: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe('Defaults to the household default servings, else the recipe servings'),
});

export const planUpdate = z.object({
  id,
  date: isoDate.optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
  servings: z.number().int().positive().max(1000).optional(),
});

export const planSlots = z.object({
  from: isoDate.describe('First day, inclusive'),
  to: isoDate.describe('Last day, inclusive'),
});

export const planAddMany = z.object({ meals: z.array(planAdd).min(1).max(100) });

export const weekPlanStart = z.object({
  meals: z
    .array(z.object({ date: isoDate, mealType: z.enum(MEAL_TYPES) }))
    .min(1)
    .max(28)
    .describe('The meals to plan, one entry per day and meal'),
  tag: z.string().trim().max(60).optional().describe('Only consider recipes with this tag'),
  maxMinutes: z.number().int().positive().max(600).optional().describe('Preparation plus cooking time ceiling, in minutes'),
  servings: z.number().int().positive().max(50).optional().describe('Defaults to the household default servings'),
  avoidRepeatDays: z.number().int().min(0).max(60).default(7).describe('Rank down recipes cooked within this many days'),
});

export const weekSlotParams = z.object({
  id: z.coerce.number().int().positive(),
  key: z.string().regex(/^\d{4}-\d{2}-\d{2}\|(breakfast|lunch|dinner|snack)$/),
});
export const weekPlanChoose = z.object({ recipeId: id });

export const aiWeekPlanStart = weekPlanStart.extend({
  meals: weekPlanStart.shape.meals.max(14).describe('The meals to plan: at most 14, one model call each'),
  wishes: z.string().trim().max(500).optional().describe('Free text: ideas, cravings, constraints'),
});
