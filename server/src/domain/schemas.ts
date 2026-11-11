import { z } from 'zod';
import { LOCATIONS, MEAL_TYPES } from '../db/schema.js';

/**
 * Input schemas shared by the REST API and the MCP tools. The `.describe()`
 * texts are what an AI client sees for each parameter.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date formatted YYYY-MM-DD');
const id = z.coerce.number().int().positive();
const unit = z
  .string()
  .max(30)
  .optional()
  .describe('Unit such as g, kg, ml, l, or a free label (can, pack). Omit for countable pieces.');
const location = z.enum(LOCATIONS).describe('Where it is stored: fridge, freezer or pantry');
const productName = z.string().trim().min(1).max(120);

export const idParam = z.object({ id });

export const productUpdate = z.object({
  id,
  name: productName.optional(),
  category: z.string().max(60).nullable().optional().describe('Free category, e.g. "Dairy"'),
  minStock: z
    .number()
    .nonnegative()
    .nullable()
    .optional()
    .describe('Low-stock alert threshold, in the product default unit. null disables the alert.'),
});

export const stockList = z.object({
  location: location.optional(),
  expiringWithinDays: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Only items expiring within this many days (already expired items included)'),
});

export const stockAdd = z.object({
  name: productName.describe('Product name; created automatically if unknown'),
  quantity: z.number().positive(),
  unit,
  location: location.default('pantry'),
  expiresOn: isoDate.nullable().optional().describe('Expiry date YYYY-MM-DD'),
});

export const stockUpdate = z.object({
  id,
  quantity: z.number().nonnegative().optional().describe('New quantity in the item unit; 0 removes the item'),
  location: location.optional(),
  expiresOn: isoDate.nullable().optional(),
});

export const stockConsume = z.object({
  name: productName,
  quantity: z.number().positive(),
  unit,
});

const ingredient = z.object({
  name: productName,
  quantity: z.number().positive(),
  unit,
  note: z.string().max(200).nullable().optional().describe('e.g. "sliced", "optional"'),
});

export const recipeCreate = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().default(4).describe('Number of servings the quantities are written for'),
  prepMinutes: z.number().int().nonnegative().nullable().optional(),
  instructions: z.string().max(20000).nullable().optional().describe('Steps, plain text or markdown'),
  ingredients: z.array(ingredient).default([]),
});

export const recipeUpdate = z.object({
  id,
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().optional(),
  prepMinutes: z.number().int().nonnegative().nullable().optional(),
  instructions: z.string().max(20000).nullable().optional(),
  ingredients: z.array(ingredient).optional().describe('If given, replaces the whole ingredient list'),
});

export const recipeList = z.object({
  search: z.string().optional().describe('Filter on recipe name or ingredient name'),
});

export const recipeAvailability = z.object({
  id,
  servings: z.coerce.number().int().positive().optional().describe('Defaults to the recipe servings'),
});

export const planList = z.object({
  from: isoDate.describe('First day, inclusive'),
  to: isoDate.describe('Last day, inclusive'),
});

export const planAdd = z.object({
  date: isoDate,
  mealType: z.enum(MEAL_TYPES),
  recipeId: id.nullable().optional().describe('Recipe to cook; omit for a free-text meal'),
  title: z.string().max(160).nullable().optional().describe('Free text when there is no recipe, e.g. "Restaurant"'),
  servings: z.number().int().positive().optional().describe('Defaults to the recipe servings'),
});

export const shoppingAdd = z.object({
  name: productName,
  quantity: z.number().positive().nullable().optional(),
  unit,
});

export const shoppingCheck = z.object({
  id,
  checked: z.boolean().default(true),
});

export const shoppingGenerate = z.object({
  from: isoDate.describe('First planned day to cover, inclusive'),
  to: isoDate.describe('Last planned day to cover, inclusive'),
  includeLowStock: z.boolean().default(true).describe('Also restock products below their minimum threshold'),
});

export const shoppingComplete = z.object({
  location: location.default('pantry').describe('Where the purchased items are put away'),
});
