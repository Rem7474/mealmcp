import { z } from 'zod';
import { stockAdd } from './stock.js';

const barcode = z
  .string()
  .trim()
  .regex(/^\d{6,14}$/, 'Expected a barcode (digits only)')
  .describe('Barcode (EAN or UPC, digits only)');

const lang = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, 'Expected a 2-letter language code such as en or fr')
  .optional()
  .describe('Language of the names to ask the catalogue for (en, fr...); the catalogue default when omitted');

export const catalogCode = z.object({ code: barcode, lang });
export const catalogSearch = z.object({ q: z.string().trim().min(1).max(120).describe('Product name to look for'), lang });

/** The MCP tool takes one of the two. */
export const catalogLookup = z.object({
  code: barcode.optional().describe('Look one item up by barcode'),
  name: z.string().trim().min(1).max(120).optional().describe('Or search by product name (up to 8 candidates)'),
  lang,
});

/** `add_stock` with a barcode: the product is found or made from it, and the pack size comes from it. */
export const stockAddFromCode = stockAdd.partial({ name: true }).extend({
  barcode: barcode.describe(
    'Barcode of what was bought. A code seen before adds to the same product, with its pack size. A new code is looked up in the Open Food Facts catalogue (only the code is sent) and attached to the product it matches; when none of your products matches, give name to attach it to one (existing or new).',
  ),
  lang,
});

/** The MCP `add_stock` tool: the usual fields, plus an optional barcode (then the name may be left out). */
export const stockAddOrCode = stockAdd.partial({ name: true }).extend({ barcode: stockAddFromCode.shape.barcode.optional(), lang });
