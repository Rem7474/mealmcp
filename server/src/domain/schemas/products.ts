import { z } from 'zod';
import { ALLERGENS } from '../diet.js';
import { id, location, productName } from './shared.js';

export const productUpdate = z.object({
  id,
  name: productName.optional(),
  category: z
    .string()
    .max(60)
    .nullable()
    .optional()
    .describe('Store aisle: produce, dairy, meat_fish, bakery, pantry, frozen, drinks, household or other (free text is accepted)'),
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
  gramsPerPiece: z
    .number()
    .positive()
    .nullable()
    .optional()
    .describe('Weight of one piece in grams (e.g. 300 for a sweet potato), so pieces and grams can be compared'),
  gramsPerMl: z
    .number()
    .positive()
    .nullable()
    .optional()
    .describe('Density in grams per ml (e.g. 0.92 for oil), so ml and grams can be compared'),
  drained: z
    .object({ netGrams: z.number().positive(), drainedGrams: z.number().positive() })
    .nullable()
    .optional()
    .describe(
      'Beans, tuna, sweetcorn: the label says netGrams (200) but recipes use drainedGrams (125). Stock is kept in net grams and recipe grams are read as drained. null clears it.',
    ),
  openedShelfLifeDays: z
    .number()
    .int()
    .positive()
    .max(365)
    .nullable()
    .optional()
    .describe('Days a pack keeps once opened (tomato sauce 3, coconut milk 4). Used to set the expiry when a pack is opened.'),
  brand: z.string().trim().max(80).nullable().optional().describe('Brand, e.g. "Bonne Maman". null clears it.'),
  barcode: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, 'Expected a barcode (digits only)')
    .nullable()
    .optional()
    .describe('Barcode (EAN/UPC, digits only). null clears it.'),
  frozenShelfLifeDays: z
    .number()
    .int()
    .positive()
    .max(1500)
    .nullable()
    .optional()
    .describe('Days it keeps in the freezer. Null: the default for its category (meat and fish 90, vegetables 240...).'),
  thawedShelfLifeDays: z
    .number()
    .int()
    .positive()
    .max(30)
    .nullable()
    .optional()
    .describe('Days it keeps once thawed (2 for meat, fish and bread). Null: the default for its category.'),
  buyPack: z
    .object({ size: z.number().positive().max(1_000_000), unit: z.enum(['g', 'ml', 'piece']) })
    .nullable()
    .optional()
    .describe(
      'How it is usually bought: one pack holds `size` of `unit` (eggs 6 piece, skyr 450 g). Learned from receipts; null forgets it.',
    ),
  buyLoose: z
    .boolean()
    .optional()
    .describe('Bought loose, by the piece or by weight (carrots, lemons): the shopping list is never rounded up to a pack'),
  defaultLocation: location
    .nullable()
    .optional()
    .describe('Where it is put away when bought (fridge, freezer, pantry). Learned; null goes back to a guess from its aisle.'),
  allergens: z
    .array(z.enum(ALLERGENS))
    .nullable()
    .optional()
    .describe('Allergens this product contains (EU list), replacing the guess made from its name. [] = none, null = back to the guess.'),
});

export const aliasAdd = z.object({
  name: productName.describe('The product (its name or an existing alias)'),
  alias: productName.describe('Another name for it, e.g. the wording on a receipt ("COTE FILET DE PORC")'),
});

export const aliasRemove = z.object({ alias: productName });

const productRef = {
  id: id.optional().describe('Product id from list_products'),
  product: productName.optional().describe('Or the product name (or an alias); "name" then renames it'),
};
export const productUpdateByRef = productUpdate.omit({ id: true }).extend(productRef);
export const productUpdateMany = z.object({ items: z.array(productUpdateByRef).min(1).max(100) });
export const productRefParam = z.object({
  id: id.optional().describe('Product id from list_products'),
  name: productName.optional().describe('Or the product name (or an alias)'),
});
