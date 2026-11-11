import { z } from 'zod';
import { LOCATIONS, MEAL_TYPES } from '../db/schema.js';
import { householdSettings } from './settings.js';

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
  staple: z
    .boolean()
    .optional()
    .describe('Always at home (oil, salt, pepper, thyme): stays in recipes but is never bought, counted as missing, or used up'),
  gramsPerPiece: z.number().positive().nullable().optional().describe('Weight of one piece in grams (e.g. 300 for a sweet potato), so pieces and grams can be compared'),
  gramsPerMl: z.number().positive().nullable().optional().describe('Density in grams per ml (e.g. 0.92 for oil), so ml and grams can be compared'),
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
  quantity: z.number().positive().optional().describe('Required unless approximate is true'),
  approximate: z
    .boolean()
    .default(false)
    .describe('"There is plenty/some, amount unknown" (e.g. lots of pasta): counts as available in checks and shopping lists and is never used up by cooking'),
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
  quantity: z.number().positive().optional().describe('Required unless toTaste is true'),
  toTaste: z.boolean().default(false).describe('"To taste" (pepper, a pinch of thyme): listed in the recipe but not counted, bought or priced'),
  unit,
  note: z.string().max(200).nullable().optional().describe('e.g. "sliced", "optional"'),
});

const step = z.object({
  text: z.string().trim().min(1).max(1000),
  durationMinutes: z.number().int().positive().max(1440).optional().describe('How long this step takes or cooks'),
  temperatureC: z.number().int().min(0).max(500).optional().describe('Oven/appliance temperature in °C'),
  appliance: z.string().trim().min(1).max(60).optional().describe('e.g. "air fryer", "oven", "stovetop"'),
});
export const EQUIPMENT_KINDS = ['appliance', 'utensil'] as const;
const equipmentName = z.string().trim().min(1).max(60);
const equipmentList = z.array(equipmentName).describe('Appliances/utensils the recipe needs, e.g. "air fryer", "mandoline". Appliances named in steps are added automatically');

export const equipmentAdd = z.object({
  name: equipmentName,
  kind: z.enum(EQUIPMENT_KINDS).default('utensil'),
  owned: z.boolean().default(true).describe('False for something a recipe needs but the household does not have'),
});
export const equipmentUpdate = z.object({
  id,
  name: equipmentName.optional(),
  kind: z.enum(EQUIPMENT_KINDS).optional(),
  owned: z.boolean().optional(),
});

const tags = z.array(z.string().trim().min(1).max(40)).describe('Labels such as "air fryer", "quick", "no shopping"');

export const recipeCreate = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().default(4).describe('Number of servings the quantities are written for'),
  prepMinutes: z.number().int().nonnegative().nullable().optional().describe('Preparation time (not cooking)'),
  cookMinutes: z.number().int().nonnegative().nullable().optional().describe('Cooking time, separate from preparation'),
  instructions: z.string().max(20000).nullable().optional().describe('Free-text instructions, plain text or markdown'),
  steps: z.array(step).default([]).describe('Structured steps with optional duration, temperature and appliance'),
  tags: tags.default([]),
  equipment: equipmentList.default([]),
  ingredients: z.array(ingredient).default([]),
});

export const recipeUpdate = z.object({
  id,
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().optional(),
  prepMinutes: z.number().int().nonnegative().nullable().optional(),
  cookMinutes: z.number().int().nonnegative().nullable().optional(),
  instructions: z.string().max(20000).nullable().optional(),
  steps: z.array(step).optional().describe('If given, replaces all steps'),
  tags: tags.optional().describe('If given, replaces all tags'),
  equipment: equipmentList.optional().describe('If given, replaces the equipment list'),
  ingredients: z.array(ingredient).optional().describe('If given, replaces the whole ingredient list'),
});

export const recipeList = z.object({
  search: z.string().optional().describe('Filter on recipe name or ingredient name'),
  tag: z.string().trim().optional().describe('Only recipes carrying this tag'),
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
  servings: z.number().int().positive().optional().describe('Defaults to the household default servings, else the recipe servings'),
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

// --- Aliases, settings, suggestions, bulk -----------------------------------

export const aliasAdd = z.object({
  name: productName.describe('The product (its name or an existing alias)'),
  alias: productName.describe('Another name for it, e.g. the wording on a receipt ("COTE FILET DE PORC")'),
});

export const aliasRemove = z.object({ alias: productName });

export const settingsSet = householdSettings;

export const planSlots = z.object({
  from: isoDate.describe('First day, inclusive'),
  to: isoDate.describe('Last day, inclusive'),
});

export const suggestRecipes = z.object({
  withinDays: z.coerce.number().int().nonnegative().default(5).describe('Use up what expires within this many days'),
  products: z.array(productName).optional().describe('Extra product names to use up, whatever their expiry'),
  tag: z.string().trim().optional().describe('Only consider recipes with this tag'),
  servings: z.coerce.number().int().positive().optional().describe('Servings to check availability for; defaults to the household default'),
  limit: z.coerce.number().int().positive().max(20).default(5),
});

export const stockAddMany = z.object({ items: z.array(stockAdd).min(1).max(200) });
export const recipeCreateMany = z.object({ recipes: z.array(recipeCreate).min(1).max(50) });
export const planAddMany = z.object({ meals: z.array(planAdd).min(1).max(100) });
export const shoppingAddMany = z.object({ items: z.array(shoppingAdd).min(1).max(200) });
