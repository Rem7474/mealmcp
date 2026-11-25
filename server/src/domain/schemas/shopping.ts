import { z } from 'zod';
import { id, isoDate, location, money, moneyOrNull, productName, unit } from './shared.js';

export const shoppingAdd = z.object({
  name: productName,
  quantity: z.number().positive().max(1_000_000).nullable().optional(),
  unit,
});

export const shoppingCheck = z.object({
  id,
  checked: z.boolean().default(true),
  price: moneyOrNull.optional().describe('What this line cost (or is expected to cost); null clears it'),
  quantity: z
    .number()
    .positive()
    .max(1_000_000)
    .optional()
    .describe('Updated quantity in the item unit: what the receipt says was really bought'),
  location: location
    .nullable()
    .optional()
    .describe('Where to put it away when shopping is completed; null goes back to the product usual place'),
});

export const shoppingGenerate = z.object({
  from: isoDate.describe('First planned day to cover, inclusive'),
  to: isoDate.describe('Last planned day to cover, inclusive'),
  includeLowStock: z.boolean().default(true).describe('Also restock products below their minimum threshold'),
});

export const shoppingComplete = z.object({
  location: location.optional().describe('Put every purchased item here. Omit to use each product usual place (fridge, freezer or pantry)'),
  store: z.string().trim().min(1).max(80).optional().describe('Shop name, recorded with the expense'),
  total: moneyOrNull.optional().describe('Amount actually paid, when it differs from the sum of the line prices'),
  date: isoDate.optional().describe('Purchase date; defaults to today'),
});

export const shoppingAddMany = z.object({ items: z.array(shoppingAdd).min(1).max(200) });

export const purchaseText = z.object({
  text: z.string().trim().min(1).max(5000).describe('What was bought, one item per line, e.g. "2 kg tomatoes", "6 eggs 2.40€"'),
});

export const purchaseApply = z.object({
  lines: z
    .array(
      z.object({
        name: productName,
        quantity: z.number().positive().max(1_000_000),
        unit,
        price: money.optional().describe('What this line cost, not a unit price'),
      }),
    )
    .min(1)
    .max(100),
  store: z.string().trim().min(1).max(80).optional(),
  date: isoDate.optional(),
  total: money.optional().describe('Amount actually paid, when it differs from the sum of the lines'),
  location: location.optional().describe('Put every line here. Omit to use each product usual place (fridge, freezer or pantry)'),
});
