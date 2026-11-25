import { z } from 'zod';
import { LOCATIONS } from '../../db/schema.js';

/** Building blocks shared by the domain schema files. */

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date formatted YYYY-MM-DD');
// Query strings and path parameters arrive as text: these coerce at runtime but are typed as plain numbers and booleans,
// so callers (services, MCP tools) see the same input types as before.
export const num = () => z.coerce.number() as unknown as z.ZodNumber;
// Not z.coerce.boolean(): Boolean("false") is true, which would turn `?ignoreDiet=false` into "ignore the diet".
export const bool = () =>
  z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v), z.boolean()) as unknown as z.ZodBoolean;

export const id = num().int().positive();
export const unit = z
  .string()
  .max(30)
  .optional()
  .describe('Unit such as g, kg, ml, l, or a free label (can, pack). Omit for countable pieces.');
export const location = z.enum(LOCATIONS).describe('Where it is stored: fridge, freezer or pantry');
export const productName = z.string().trim().min(1).max(120);
export const moneyOrNull = z
  .number()
  .nonnegative()
  .max(1_000_000)
  .nullable()
  .describe('Amount in the household currency, as a decimal number (e.g. 2.49)');

export const money = z.number().nonnegative().max(1_000_000).describe('Amount in the household currency, as a decimal number (e.g. 2.49)');

export const idParam = z.object({ id });
