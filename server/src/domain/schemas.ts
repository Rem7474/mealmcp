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
const moneyOrNull = z.number().nonnegative().max(1_000_000).nullable().describe('Amount in the household currency, as a decimal number (e.g. 2.49)');

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
  price: moneyOrNull.optional().describe('What this line cost (or is expected to cost); null clears it'),
});

export const shoppingGenerate = z.object({
  from: isoDate.describe('First planned day to cover, inclusive'),
  to: isoDate.describe('Last planned day to cover, inclusive'),
  includeLowStock: z.boolean().default(true).describe('Also restock products below their minimum threshold'),
});

export const shoppingComplete = z.object({
  location: location.default('pantry').describe('Where the purchased items are put away'),
  store: z.string().trim().min(1).max(80).optional().describe('Shop name, recorded with the expense'),
  total: moneyOrNull.optional().describe('Amount actually paid, when it differs from the sum of the line prices'),
  date: isoDate.optional().describe('Purchase date; defaults to today'),
});

// --- Budget -------------------------------------------------------------------

const money = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .describe('Amount in the household currency, as a decimal number (e.g. 2.49)');

const expenseItem = z.object({
  name: productName,
  quantity: z.number().positive().optional().describe('Quantity bought; with it, the product price is remembered and used for cost estimates'),
  unit,
  price: money.describe('Line total (what this line cost), not a unit price'),
});

export const expenseRecord = z.object({
  date: isoDate.optional().describe('Purchase date; defaults to today'),
  store: z.string().trim().min(1).max(80).optional().describe('Shop name, e.g. "Leclerc"'),
  note: z.string().max(300).optional(),
  items: z.array(expenseItem).default([]).describe('Receipt lines. Optional when only a total is known'),
  total: money.optional().describe('Amount actually paid. Defaults to the sum of the item prices; set it when discounts apply'),
  addToStock: z.boolean().default(false).describe('Also put the lines that have a quantity into the stock'),
  location: location.default('pantry').describe('Where stocked items go when addToStock is true'),
});

export const expenseList = z.object({
  from: isoDate.optional().describe('First day, inclusive'),
  to: isoDate.optional().describe('Last day, inclusive'),
});

export const spendingSummary = z.object({
  from: isoDate.describe('First day, inclusive'),
  to: isoDate.describe('Last day, inclusive'),
});

export const budgetSet = z.object({
  monthly: money.nullable().describe('Monthly grocery budget; null removes it'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Expected a 3-letter currency code such as EUR or USD')
    .optional()
    .describe('ISO 4217 currency code for the household'),
});

export const productPrice = z.object({
  name: productName,
  price: money.describe('Price paid for `quantity` `unit`'),
  quantity: z.number().positive().default(1).describe('How much that price buys, e.g. 1 with unit kg'),
  unit,
});
