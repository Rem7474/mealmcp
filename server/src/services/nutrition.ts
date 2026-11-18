import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products } from '../db/schema.js';
import { convertQuantity } from '../domain/convert.js';
import { ValidationError } from '../domain/errors.js';
import {
  addInto,
  emptyTotals,
  NUTRIENTS,
  type Nutrient,
  type NutrientValues,
  type ProductNutrition,
  roundTotals,
  scale,
} from '../domain/nutrition.js';
import type { nutritionPlan, nutritionSearch, productNutritionSet } from '../domain/schemas.js';
import { type CatalogHit, createCatalogClient, type Fetch } from './catalog.js';
import type { PlannerService } from './planner.js';
import type { ProductService } from './products.js';
import type { RecipeService } from './recipes.js';
import type { SettingsService } from './settings.js';

/** A catalogue entry seen as nutrition: null when it has no values. */
const nutritional = (h: CatalogHit): NutritionHit | null =>
  h.per100 ? { code: h.code, name: h.name, brands: h.brands, per100: h.per100 } : null;

export interface NutritionHit {
  code: string;
  name: string;
  brands: string | null;
  per100: NutrientValues;
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

/** The hit closest to a product name: all its words present, then the shortest (most generic) name. */
export function closestHit(name: string, hits: NutritionHit[]): NutritionHit | null {
  const want = plain(name);
  if (want.length === 0) return null;
  let best: { hit: NutritionHit; score: number } | null = null;
  for (const hit of hits) {
    const words = new Set(plain(hit.name));
    const found = want.filter((w) => [...words].some((x) => x === w || x.startsWith(w) || w.startsWith(x))).length;
    if (found < Math.ceil(want.length / 2)) continue;
    const score = (found / want.length) * 100 - hit.name.length * 0.2 - (hit.brands ? 5 : 0);
    if (!best || score > best.score) best = { hit, score };
  }
  return best?.hit ?? null;
}

/**
 * Optional nutrition module: calories and macros per recipe, meal and day, from per-product values that come
 * from Open Food Facts (looked up on demand, only the name or barcode is sent) or are typed by hand.
 * Everything is off until the household turns it on.
 */
export function createNutritionService(
  db: Db,
  hid: number,
  settings: SettingsService,
  productService: ProductService,
  recipeService: RecipeService,
  planner: PlannerService,
  fetchImpl: Fetch = fetch,
) {
  const mine = eq(products.householdId, hid);
  const catalog = createCatalogClient(fetchImpl, hid);
  const requireOn = () => {
    if (!settings.get().nutrition?.enabled)
      throw new ValidationError('The nutrition module is off. Turn it on in the household settings (nutrition.enabled).');
  };

  /** Weight in grams of a quantity of a product; 1 ml counts as 1 g when the density is not known. */
  const gramsOf = (product: Parameters<typeof convertQuantity>[3], quantity: number, unit: string): number | null => {
    const direct = convertQuantity(quantity, unit, 'g', product);
    if (direct !== null) return direct;
    return unit === 'ml' ? quantity : null;
  };

  const svc = {
    enabled: () => !!settings.get().nutrition?.enabled,

    /** Looks products up on Open Food Facts by name (those with nutrition values). Only the search text leaves the server. */
    async search({ query }: z.infer<typeof nutritionSearch>): Promise<NutritionHit[]> {
      requireOn();
      return (await catalog.search(query)).flatMap((h) => (nutritional(h) ? [nutritional(h) as NutritionHit] : []));
    },

    /** One product by barcode. */
    async lookup(code: string): Promise<NutritionHit | null> {
      requireOn();
      const hit = await catalog.product(code);
      return hit ? nutritional(hit) : null;
    },

    /** Keeps nutrition values on a product: fetched from a barcode, or typed by hand. Without either, clears them. */
    async setProduct({ id, code, per100 }: z.infer<typeof productNutritionSet>) {
      requireOn();
      productService.get(id); // Throws when the product is not in this household.
      let value: ProductNutrition | null = null;
      let hit: NutritionHit | null = null;
      if (code) {
        hit = await svc.lookup(code);
        if (!hit) throw new ValidationError('That product has no usable nutrition values on Open Food Facts.');
        value = { per100: hit.per100, source: 'openfoodfacts', code: hit.code, label: [hit.name, hit.brands].filter(Boolean).join(' · ') };
      } else if (per100) {
        value = { per100, source: 'manual' };
      }
      db.update(products)
        .set({ nutrition: value ? JSON.stringify(value) : null })
        .where(and(mine, eq(products.id, id)))
        .run();
      // A barcode that resolved is worth keeping on the product (with its brand) unless it already belongs to another one.
      if (hit && !productService.findByBarcode(hit.code))
        productService.attachBarcode(id, hit.code, { brand: hit.brands?.split(',')[0]?.trim() || null, label: hit.name });
      return productService.get(id);
    },

    /**
     * Fills in the ingredients of a recipe that have no values yet, taking the closest Open Food Facts match by
     * name. Values typed by hand are never replaced. Returns how many products were filled.
     */
    async autofillRecipe(recipeId: number): Promise<number> {
      requireOn();
      const recipe = recipeService.get(recipeId);
      let filled = 0;
      const seen = new Set<number>();
      for (const ing of recipe.ingredients) {
        if (ing.toTaste || seen.has(ing.productId)) continue;
        seen.add(ing.productId);
        const product = productService.get(ing.productId);
        if (product.nutrition) continue;
        let hits: NutritionHit[];
        try {
          hits = await svc.search({ query: product.name });
        } catch {
          break; // Open Food Facts is unreachable: stop, nothing is lost.
        }
        const hit = closestHit(product.name, hits);
        if (!hit) continue;
        const value: ProductNutrition = {
          per100: hit.per100,
          source: 'openfoodfacts',
          code: hit.code,
          label: [hit.name, hit.brands].filter(Boolean).join(' · '),
          auto: true,
        };
        db.update(products)
          .set({ nutrition: JSON.stringify(value) })
          .where(and(mine, eq(products.id, product.id)))
          .run();
        filled += 1;
      }
      return filled;
    },

    /**
     * Calories and macros of a recipe, in total and per serving. Ingredients without values (or whose quantity
     * cannot be turned into grams) are listed in `coverage.missing`, so the totals read as a lower bound.
     */
    recipe(recipeId: number) {
      requireOn();
      const recipe = recipeService.get(recipeId);
      const byId = new Map(productService.list().map((p) => [p.id, p]));
      const total = emptyTotals();
      const missing: string[] = [];
      let counted = 0;
      let covered = 0;
      for (const ing of recipe.ingredients) {
        if (ing.toTaste) continue;
        counted += 1;
        const product = byId.get(ing.productId)!;
        const grams = product.nutrition ? gramsOf(product, ing.quantity, ing.unit) : null;
        if (!product.nutrition || grams === null) {
          missing.push(product.name);
          continue;
        }
        covered += 1;
        addInto(total, scale(product.nutrition.per100, grams));
      }
      const perServing = emptyTotals();
      for (const n of NUTRIENTS) perServing[n] = total[n] / (recipe.servings || 1);
      return {
        recipeId,
        name: recipe.name,
        servings: recipe.servings,
        total: roundTotals(total),
        perServing: roundTotals(perServing),
        coverage: { ingredients: counted, covered, missing, complete: counted > 0 && missing.length === 0 },
      };
    },

    /**
     * What one person eats each day between two dates, from the planned meals that have a recipe (free-text meals
     * cannot be counted). Per meal and per day, with the share of ingredients that had values.
     */
    plan({ from, to }: z.infer<typeof nutritionPlan>) {
      requireOn();
      const cache = new Map<number, ReturnType<typeof svc.recipe>>();
      const days = new Map<
        string,
        {
          date: string;
          meals: { id: number; mealType: string; name: string; perServing: Record<Nutrient, number>; complete: boolean }[];
          perPerson: Record<Nutrient, number>;
        }
      >();
      let skipped = 0;
      for (const meal of planner.list({ from, to })) {
        if (!meal.recipeId) {
          skipped += 1;
          continue;
        }
        const r = cache.get(meal.recipeId) ?? svc.recipe(meal.recipeId);
        cache.set(meal.recipeId, r);
        const day = days.get(meal.date) ?? { date: meal.date, meals: [], perPerson: emptyTotals() };
        day.meals.push({ id: meal.id, mealType: meal.mealType, name: r.name, perServing: r.perServing, complete: r.coverage.complete });
        addInto(day.perPerson, r.perServing);
        days.set(meal.date, day);
      }
      return {
        from,
        to,
        note: 'Per person: one serving of each planned recipe. Free-text meals are not counted.',
        freeTextMealsSkipped: skipped,
        days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, perPerson: roundTotals(d.perPerson) })),
      };
    },
  };
  return svc;
}

export type NutritionService = ReturnType<typeof createNutritionService>;
