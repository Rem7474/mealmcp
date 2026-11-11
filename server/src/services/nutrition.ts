import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products } from '../db/schema.js';
import { convertQuantity } from '../domain/convert.js';
import { ValidationError } from '../domain/errors.js';
import {
  addInto,
  emptyTotals,
  fromOpenFoodFacts,
  type Nutrient,
  type NutrientValues,
  NUTRIENTS,
  type ProductNutrition,
  roundTotals,
  scale,
} from '../domain/nutrition.js';
import type { nutritionPlan, nutritionSearch, productNutritionSet } from '../domain/schemas.js';
import type { PlannerService } from './planner.js';
import type { ProductService } from './products.js';
import type { RecipeService } from './recipes.js';
import type { SettingsService } from './settings.js';

const USER_AGENT = 'MealMCP (self-hosted meal planner; https://github.com/Rem7474/mealmcp)';
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

type Fetch = typeof fetch;

export interface NutritionHit {
  code: string;
  name: string;
  brands: string | null;
  per100: NutrientValues;
}

async function getJson(fetchImpl: Fetch, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new ValidationError('Open Food Facts cannot be reached right now. Try again later, or type the values by hand.');
  }
  if (res.status === 404) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('json')) throw new ValidationError('Open Food Facts is not available right now. Try again later, or type the values by hand.');
  return res.json();
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
  const requireOn = () => {
    if (!settings.get().nutrition?.enabled) throw new ValidationError('The nutrition module is off. Turn it on in the household settings (nutrition.enabled).');
  };

  /** Weight in grams of a quantity of a product; 1 ml counts as 1 g when the density is not known. */
  const gramsOf = (product: Parameters<typeof convertQuantity>[3], quantity: number, unit: string): number | null => {
    const direct = convertQuantity(quantity, unit, 'g', product);
    if (direct !== null) return direct;
    return unit === 'ml' ? quantity : null;
  };

  const svc = {
    enabled: () => !!settings.get().nutrition?.enabled,

    /** Looks products up on Open Food Facts by name. Only the search text leaves the server. */
    async search({ query }: z.infer<typeof nutritionSearch>): Promise<NutritionHit[]> {
      requireOn();
      const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&page_size=8&fields=code,product_name,brands,nutriments`;
      const body = (await getJson(fetchImpl, url)) as { hits?: { code?: string; product_name?: string; brands?: string[] | string; nutriments?: unknown }[] } | null;
      const hits: NutritionHit[] = [];
      for (const h of body?.hits ?? []) {
        const per100 = fromOpenFoodFacts(h.nutriments);
        if (!per100 || !h.code || !h.product_name) continue;
        hits.push({ code: h.code, name: h.product_name, brands: Array.isArray(h.brands) ? h.brands.join(', ') || null : (h.brands ?? null), per100 });
      }
      return hits;
    },

    /** One product by barcode. */
    async lookup(code: string): Promise<NutritionHit | null> {
      requireOn();
      const body = (await getJson(fetchImpl, `${PRODUCT_URL}/${encodeURIComponent(code)}.json?fields=code,product_name,brands,nutriments`)) as {
        product?: { code?: string; product_name?: string; brands?: string; nutriments?: unknown };
      } | null;
      const p = body?.product;
      const per100 = fromOpenFoodFacts(p?.nutriments);
      if (!p || !per100) return null;
      return { code: p.code ?? code, name: p.product_name ?? code, brands: p.brands || null, per100 };
    },

    /** Keeps nutrition values on a product: fetched from a barcode, or typed by hand. Without either, clears them. */
    async setProduct({ id, code, per100 }: z.infer<typeof productNutritionSet>) {
      requireOn();
      productService.get(id);
      let value: ProductNutrition | null = null;
      if (code) {
        const hit = await svc.lookup(code);
        if (!hit) throw new ValidationError('That product has no usable nutrition values on Open Food Facts.');
        value = { per100: hit.per100, source: 'openfoodfacts', code: hit.code, label: [hit.name, hit.brands].filter(Boolean).join(' · ') };
      } else if (per100) {
        value = { per100, source: 'manual' };
      }
      db.update(products).set({ nutrition: value ? JSON.stringify(value) : null }).where(and(mine, eq(products.id, id))).run();
      return productService.get(id);
    },

    /**
     * Calories and macros of a recipe, in total and per serving. Ingredients without values (or whose quantity
     * cannot be turned into grams) are listed in `coverage.missing`, so the totals read as a lower bound.
     */
    recipe(recipeId: number) {
      requireOn();
      const recipe = recipeService.get(recipeId);
      const total = emptyTotals();
      const missing: string[] = [];
      let counted = 0;
      let covered = 0;
      for (const ing of recipe.ingredients) {
        if (ing.toTaste) continue;
        counted += 1;
        const product = productService.get(ing.productId);
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
      const days = new Map<string, { date: string; meals: { id: number; mealType: string; name: string; perServing: Record<Nutrient, number>; complete: boolean }[]; perPerson: Record<Nutrient, number> }>();
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
