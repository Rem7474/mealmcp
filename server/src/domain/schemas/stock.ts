import { z } from 'zod';
import { DATE_KINDS } from '../../db/schema.js';
import { id, isoDate, location, num, productName, unit } from './shared.js';

export const stockList = z.object({
  location: location.optional(),
  expiringWithinDays: num()
    .int()
    .nonnegative()
    .optional()
    .describe('Only items expiring within this many days (already expired items included)'),
});

const dateKind = z
  .enum(DATE_KINDS)
  .nullable()
  .optional()
  .describe(
    'What the expiry date means: use_by ("use by", unsafe after, to throw away) or best_before (quality only, still fine to check). Omit when unknown.',
  );

const note = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .describe('Free text about this line ("for Sunday", "a gift"). Lines with different notes are kept apart.');

export const stockAdd = z.object({
  name: productName.describe('Product name; created automatically if unknown'),
  quantity: z.number().positive().max(1_000_000).optional().describe('Required unless approximate is true'),
  approximate: z
    .boolean()
    .default(false)
    .describe(
      '"There is plenty/some, amount unknown" (e.g. lots of pasta): counts as available in checks and shopping lists and is never used up by cooking',
    ),
  unit,
  location: location.default('pantry'),
  expiresOn: isoDate.nullable().optional().describe('Expiry date YYYY-MM-DD'),
  dateKind,
  note,
  packCount: z
    .number()
    .int()
    .positive()
    .max(10_000)
    .optional()
    .describe(
      'Bought in packs: "2 x 500 g" is packCount 2 + packSize 500 + unit g; "3 cartons of 200 ml" is packCount 3, packSize 200, unit ml. Keeps both the count and the size (do not send quantity).',
    ),
  packSize: z
    .number()
    .positive()
    .max(1_000_000)
    .optional()
    .describe('Size of one pack, in `unit`. With packCount, the quantity is their product.'),
  opened: z
    .boolean()
    .optional()
    .describe('This pack/jar is already opened; `quantity` is what is left of it. It then expires after the product opened shelf life.'),
  openedOn: isoDate.optional().describe('When it was opened (defaults to today)'),
  price: z
    .number()
    .nonnegative()
    .max(1_000_000)
    .optional()
    .describe('Total paid for this quantity, in the household currency (e.g. 3.40). Waste of this line is then valued at it.'),
});

export const stockOpen = z.object({
  id,
  remaining: z.number().positive().optional().describe('What is left of the opened pack, in the item unit. Defaults to the whole pack.'),
  shelfLifeDays: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .describe('Days it keeps once opened; remembered for the product when it has none yet'),
});

export const stockUpdate = z.object({
  id,
  quantity: z.number().nonnegative().optional().describe('New quantity in the item unit; 0 removes the item'),
  packCount: z.number().int().positive().optional().describe('For a line kept in packs: how many unopened packs there are now'),
  location: location.optional(),
  expiresOn: isoDate.nullable().optional(),
  dateKind,
  note,
  openedOn: isoDate
    .optional()
    .describe(
      'Correct the opening date of an opened pack (not in the future); its expiry is recomputed from the product opened shelf life',
    ),
});

export const stockFreeze = z.object({
  id,
  quantity: z
    .number()
    .positive()
    .optional()
    .describe(
      'Freeze only this part of the line, in the item unit (300 for 300 g of a 1 kg line). The line is split: the frozen part gets the freezing date, the rest keeps its date. Omit to freeze all of it.',
    ),
  refreeze: z.boolean().optional().describe('Freeze a line that was already thawed anyway (not recommended: quality and safety suffer)'),
});

export const stockConsume = z.object({
  name: productName,
  quantity: z.number().positive().max(1_000_000),
  unit,
});

// MCP callers know names better than ids: wherever an id is asked, a name can be given instead.
const lineRef = {
  id: id.optional().describe('Stock line id from list_stock'),
  name: productName
    .optional()
    .describe('Or the product name (or an alias) when it has one line that applies; with several, the answer lists them to pick from'),
};
export const stockLineRef = z.object(lineRef);
export const stockOpenByRef = stockOpen.omit({ id: true }).extend(lineRef);
export const stockUpdateByRef = stockUpdate.omit({ id: true }).extend(lineRef);
export const stockFreezeByRef = stockFreeze.omit({ id: true }).extend(lineRef);
export const stockUpdateMany = z.object({ items: z.array(stockUpdateByRef).min(1).max(100) });

export const stockAddMany = z.object({ items: z.array(stockAdd).min(1).max(200) });

export const stockDiscard = z.object({
  id,
  quantity: z.number().positive().optional().describe('How much was thrown away, in the line unit; omit to throw away the whole line'),
  reason: z.enum(['expired', 'spoiled', 'leftover', 'other']).default('expired'),
});
