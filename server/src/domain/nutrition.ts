/**
 * Nutrition values, per 100 g of a product (or 100 ml: they are treated alike, see `gramsOf`).
 * They come from Open Food Facts (an optional module, off by default) or are typed by hand.
 */

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'sugars', 'fat', 'saturatedFat', 'fiber', 'salt'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

export type NutrientValues = Partial<Record<Nutrient, number>>;

export interface ProductNutrition {
  /** Values for 100 g (or 100 ml). A missing nutrient is unknown, not zero. */
  per100: NutrientValues;
  source: 'openfoodfacts' | 'manual';
  /** Barcode of the Open Food Facts product the values were taken from. */
  code?: string;
  /** Name of that product, so the household can tell what was picked. */
  label?: string;
}

/** Open Food Facts field names for each nutrient (all expressed per 100 g, kcal and grams). */
const OFF_FIELDS: Record<Nutrient, string> = {
  kcal: 'energy-kcal_100g',
  protein: 'proteins_100g',
  carbs: 'carbohydrates_100g',
  sugars: 'sugars_100g',
  fat: 'fat_100g',
  saturatedFat: 'saturated-fat_100g',
  fiber: 'fiber_100g',
  salt: 'salt_100g',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Reads the nutrients we keep from an Open Food Facts `nutriments` object; null when there is nothing useful. */
export function fromOpenFoodFacts(nutriments: unknown): NutrientValues | null {
  if (!nutriments || typeof nutriments !== 'object') return null;
  const raw = nutriments as Record<string, unknown>;
  const out: NutrientValues = {};
  for (const n of NUTRIENTS) {
    const v = raw[OFF_FIELDS[n]];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[n] = round1(v);
  }
  // Without energy the rest cannot be trusted to describe a whole food.
  return out.kcal === undefined ? null : out;
}

export const emptyTotals = (): Record<Nutrient, number> => Object.fromEntries(NUTRIENTS.map((n) => [n, 0])) as Record<Nutrient, number>;

/** `grams` of a product with `per100` values, as a total for each nutrient that is known. */
export function scale(per100: NutrientValues, grams: number): NutrientValues {
  const out: NutrientValues = {};
  for (const n of NUTRIENTS) if (per100[n] !== undefined) out[n] = (per100[n] as number) * (grams / 100);
  return out;
}

export function addInto(total: Record<Nutrient, number>, add: NutrientValues) {
  for (const n of NUTRIENTS) total[n] += add[n] ?? 0;
}

export const roundTotals = (t: Record<Nutrient, number>): Record<Nutrient, number> =>
  Object.fromEntries(NUTRIENTS.map((n) => [n, round1(t[n])])) as Record<Nutrient, number>;
