import { z } from 'zod';
import { id, isoDate } from './shared.js';

const nutrientNumber = z.number().nonnegative().max(1000);
export const nutritionSearch = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .describe('Product name to look up on Open Food Facts, e.g. "oat flakes". Only this text is sent.'),
});
export const productNutritionSet = z.object({
  id,
  code: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, 'Expected a barcode (digits only)')
    .optional()
    .describe('Barcode of an Open Food Facts product (from search_nutrition): its values are fetched and kept on the product'),
  per100: z
    .object({
      kcal: nutrientNumber,
      protein: nutrientNumber.optional(),
      carbs: nutrientNumber.optional(),
      sugars: nutrientNumber.optional(),
      fat: nutrientNumber.optional(),
      saturatedFat: nutrientNumber.optional(),
      fiber: nutrientNumber.optional(),
      salt: nutrientNumber.optional(),
    })
    .optional()
    .describe('Values typed by hand, per 100 g (or 100 ml): kcal and grams'),
});
export const nutritionPlan = z.object({ from: isoDate, to: isoDate });
