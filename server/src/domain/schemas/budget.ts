import { z } from 'zod';
import { isoDate, location, money, productName, unit } from './shared.js';

const expenseItem = z.object({
  name: productName,
  quantity: z
    .number()
    .positive()
    .max(1_000_000)
    .optional()
    .describe('Quantity bought; with it, the product price is remembered and used for cost estimates'),
  unit,
  price: money.describe('Line total (what this line cost), not a unit price'),
});

export const expenseRecord = z.object({
  date: isoDate.optional().describe('Purchase date; defaults to today'),
  store: z.string().trim().min(1).max(80).optional().describe('Shop name, e.g. "Leclerc"'),
  note: z.string().max(300).optional(),
  items: z.array(expenseItem).max(200).default([]).describe('Receipt lines. Optional when only a total is known'),
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
  store: z.string().trim().min(1).max(80).optional().describe('Shop where that price was seen, to compare shops'),
  date: isoDate.optional().describe('When that price was seen; defaults to today. The most recent price is the one estimates use'),
});
