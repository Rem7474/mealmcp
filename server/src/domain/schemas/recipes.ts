import { z } from 'zod';
import { equipmentList } from './equipment.js';
import { bool, id, num, productName, unit } from './shared.js';

const ingredient = z.object({
  name: productName,
  quantity: z.number().positive().max(100_000).optional().describe('Required unless toTaste is true'),
  toTaste: z
    .boolean()
    .default(false)
    .describe('"To taste" (pepper, a pinch of thyme): listed in the recipe but not counted, bought or priced'),
  unit,
  note: z.string().max(200).nullable().optional().describe('e.g. "sliced", "optional"'),
});

const step = z.object({
  text: z.string().trim().min(1).max(1000),
  durationMinutes: z.number().int().positive().max(1440).optional().describe('How long this step takes or cooks'),
  temperatureC: z.number().int().min(0).max(500).optional().describe('Oven/appliance temperature in °C'),
  appliance: z.string().trim().min(1).max(60).optional().describe('e.g. "air fryer", "oven", "stovetop"'),
});

const rating = z
  .number()
  .int()
  .min(1)
  .max(5)
  .nullable()
  .optional()
  .describe('How much the household likes it, 1 to 5 stars (null clears it)');
const tags = z.array(z.string().trim().min(1).max(40)).max(30).describe('Labels such as "air fryer", "quick", "no shopping"');

export const recipeCreate = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().max(1000).default(4).describe('Number of servings the quantities are written for'),
  prepMinutes: z.number().int().nonnegative().nullable().optional().describe('Preparation time (not cooking)'),
  cookMinutes: z.number().int().nonnegative().nullable().optional().describe('Cooking time, separate from preparation'),
  rating: rating,
  favorite: z.boolean().optional().describe('Mark as a household favorite: favorites are suggested first'),
  steps: z.array(step).max(100).default([]).describe('Structured steps with optional duration, temperature and appliance'),
  tags: tags.default([]),
  equipment: equipmentList.default([]),
  ingredients: z.array(ingredient).max(100).default([]),
});

export const recipeUpdate = z.object({
  id,
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().max(1000).optional(),
  prepMinutes: z.number().int().nonnegative().nullable().optional(),
  cookMinutes: z.number().int().nonnegative().nullable().optional(),
  rating: rating,
  favorite: z.boolean().optional(),
  steps: z.array(step).max(100).optional().describe('If given, replaces all steps'),
  tags: tags.optional().describe('If given, replaces all tags'),
  equipment: equipmentList.optional().describe('If given, replaces the equipment list'),
  ingredients: z.array(ingredient).max(100).optional().describe('If given, replaces the whole ingredient list'),
});

export const recipeList = z.object({
  search: z.string().optional().describe('Filter on recipe name or ingredient name'),
  tag: z.string().trim().optional().describe('Only recipes carrying this tag'),
  favorite: bool().optional().describe('Only favorites'),
  minRating: num().int().min(1).max(5).optional().describe('Only recipes rated at least this many stars'),
});

export const recipeAvailability = z.object({
  id,
  servings: num().int().positive().optional().describe('Defaults to the recipe servings'),
});

export const suggestRecipes = z.object({
  withinDays: num().int().nonnegative().default(5).describe('Use up what expires within this many days'),
  products: z.array(productName).max(50).optional().describe('Extra product names to use up, whatever their expiry'),
  tag: z.string().trim().optional().describe('Only consider recipes with this tag'),
  servings: num().int().positive().optional().describe('Servings to check availability for; defaults to the household default'),
  limit: num().int().positive().max(20).default(5),
  ignoreDiet: bool()
    .optional()
    .describe('Also return recipes that break the household diet, allergens or dislikes (they are left out by default)'),
});

export const recipeCreateMany = z.object({ recipes: z.array(recipeCreate).min(1).max(50) });
