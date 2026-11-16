import { z } from 'zod';
import {
  STARTER_AISLES,
  STARTER_LANGS,
  STARTER_PRODUCTS,
  STARTER_RECIPES,
  type StarterLang,
  type StarterProductKey,
  starterName,
  starterTag,
} from '../domain/starter.js';
import type { createProductService } from './products.js';
import type { createRecipeService } from './recipes.js';
import type { createStockService } from './stock.js';

const lang = z.enum(STARTER_LANGS).default('en');
const productKey = z.enum(Object.keys(STARTER_PRODUCTS) as [StarterProductKey, ...StarterProductKey[]]);
const recipeKey = z.enum(STARTER_RECIPES.map((r) => r.key) as [string, ...string[]]);

export const starterQuery = z.object({ lang });
export const starterStockAdd = z.object({ lang, products: z.array(productKey).min(1).max(100) });
export const starterRecipesAdd = z.object({ lang, recipes: z.array(recipeKey).min(1).max(STARTER_RECIPES.length) });

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Countable things carry no unit in the app. */
const unitOf = (unit: 'g' | 'ml' | 'piece') => (unit === 'piece' ? undefined : unit);

/**
 * Starting content for a new household: everyday products to tick by aisle and simple recipes to import. Both are
 * safe to repeat: what already exists is left alone and reported as skipped.
 */
export function createStarterService(
  products: ReturnType<typeof createProductService>,
  stock: ReturnType<typeof createStockService>,
  recipes: ReturnType<typeof createRecipeService>,
) {
  /** Sets the aisle and the "always at home" flag on a product this call just created, never on one the household shaped. */
  const prepare = (key: StarterProductKey, language: StarterLang) => {
    const def = STARTER_PRODUCTS[key];
    const name = starterName(key, language);
    const isNew = !products.findByName(name);
    const product = products.findOrCreate(name, unitOf(def.unit));
    if (isNew) products.update({ id: product.id, category: def.aisle, ...(def.staple ? { staple: true } : {}) });
    return product;
  };

  return {
    /** What can be offered, in the language asked, with what the household already has marked. */
    overview({ lang: language }: z.input<typeof starterQuery>) {
      const l = starterQuery.parse({ lang: language }).lang;
      const inStock = new Set(stock.list().map((line) => line.productId));
      const names = recipes.list().map((r) => r.name);
      return {
        aisles: STARTER_AISLES.map((aisle) => ({
          aisle,
          products: (Object.keys(STARTER_PRODUCTS) as StarterProductKey[])
            .filter((key) => STARTER_PRODUCTS[key].aisle === aisle)
            .map((key) => {
              const name = starterName(key, l);
              const known = products.findByName(name);
              const staple = STARTER_PRODUCTS[key].staple === true;
              return { key, name, staple, added: staple ? known?.isStaple === true : known !== undefined && inStock.has(known.id) };
            }),
        })).filter((a) => a.products.length > 0),
        recipes: STARTER_RECIPES.map((r) => ({
          key: r.key,
          name: r.name[l],
          servings: r.servings,
          minutes: r.prepMinutes + r.cookMinutes,
          tags: r.tags.map((t) => starterTag(t, l)),
          ingredients: r.ingredients.map(([p]) => starterName(p, l)),
          imported: names.some((n) => same(n, r.name[l])),
        })),
      };
    },

    /**
     * Marks products as "there is some at home": no quantity to type, they count as available and are never used up.
     * Staples (oil, salt) are flagged instead. A product that already has stock is skipped.
     */
    addStock({ lang: language, products: keys }: z.input<typeof starterStockAdd>) {
      const l = starterStockAdd.shape.lang.parse(language);
      const unique = [...new Set(keys)] as StarterProductKey[];
      let added = 0;
      let skipped = 0;
      const had = new Set(stock.list().map((line) => line.productId));
      for (const key of unique) {
        const def = STARTER_PRODUCTS[key];
        const product = prepare(key, l);
        if (def.staple) {
          if (product.isStaple) skipped++;
          else {
            products.update({ id: product.id, staple: true });
            added++;
          }
        } else if (had.has(product.id)) skipped++;
        else {
          stock.add({ name: product.name, approximate: true, unit: unitOf(def.unit), location: def.where });
          added++;
        }
      }
      return { added, skipped };
    },

    /** Imports the chosen recipes; one with the same name already in the household is skipped. */
    importRecipes({ lang: language, recipes: keys }: z.input<typeof starterRecipesAdd>) {
      const l = starterRecipesAdd.shape.lang.parse(language);
      const names = recipes.list().map((r) => r.name);
      const chosen = STARTER_RECIPES.filter((r) => keys.includes(r.key));
      const fresh = chosen.filter((r) => !names.some((n) => same(n, r.name[l])));
      for (const r of fresh) for (const [p] of r.ingredients) prepare(p, l);
      const created = recipes.createMany(
        fresh.map((r) => ({
          name: r.name[l],
          servings: r.servings,
          prepMinutes: r.prepMinutes,
          cookMinutes: r.cookMinutes,
          tags: r.tags.map((t) => starterTag(t, l)),
          steps: r.steps[l].map((text) => ({ text })),
          ingredients: r.ingredients.map(([p, quantity]) => ({
            name: starterName(p, l),
            unit: unitOf(STARTER_PRODUCTS[p].unit),
            ...(quantity === null ? { toTaste: true } : { quantity }),
          })),
        })),
      );
      return { created: created.length, skipped: chosen.length - fresh.length, recipes: created.map((r) => ({ id: r.id, name: r.name })) };
    },
  };
}
