import { and, asc, eq, like, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products, recipeIngredients, recipeSteps, recipeTags, recipes } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { recipeAvailability, recipeCreate, recipeList, recipeUpdate, suggestRecipes } from '../domain/schemas.js';
import { round, toBase } from '../domain/units.js';
import type { ProductService } from './products.js';
import type { SettingsService } from './settings.js';
import type { StockService } from './stock.js';

type Ingredients = NonNullable<z.input<typeof recipeUpdate>['ingredients']>;
type Steps = NonNullable<z.input<typeof recipeUpdate>['steps']>;

export function createRecipeService(db: Db, hid: number, productService: ProductService, stock: StockService, settings: SettingsService) {
  const mine = eq(recipes.householdId, hid);

  const insertIngredients = (recipeId: number, ingredients: Ingredients) => {
    for (const ing of ingredients) {
      const product = productService.findOrCreate(ing.name, ing.unit);
      const toTaste = ing.toTaste ?? false;
      if (!toTaste && ing.quantity === undefined) throw new ValidationError(`Ingredient "${ing.name}" needs a quantity (or toTaste: true)`);
      const { quantity, unit } = toTaste ? { quantity: 0, unit: product.defaultUnit } : toBase(ing.quantity as number, ing.unit ?? product.defaultUnit);
      db.insert(recipeIngredients).values({ recipeId, productId: product.id, quantity, unit, note: ing.note ?? null, toTaste }).run();
    }
  };
  const insertSteps = (recipeId: number, steps: Steps) =>
    steps.forEach((s, i) =>
      db
        .insert(recipeSteps)
        .values({ recipeId, position: i + 1, text: s.text, durationMinutes: s.durationMinutes ?? null, temperatureC: s.temperatureC ?? null, appliance: s.appliance ?? null })
        .run(),
    );
  const insertTags = (recipeId: number, tags: string[]) => {
    for (const tag of new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))) db.insert(recipeTags).values({ recipeId, tag }).run();
  };

  const svc = {
    list({ search, tag }: z.input<typeof recipeList> = {}) {
      const pattern = `%${search?.trim() ?? ''}%`;
      const rows = db
        .select({
          id: recipes.id,
          name: recipes.name,
          description: recipes.description,
          servings: recipes.servings,
          prepMinutes: recipes.prepMinutes,
          cookMinutes: recipes.cookMinutes,
          // Table names are written out: drizzle leaves columns unqualified in single-table selects.
          ingredientCount: sql<number>`(select count(*) from recipe_ingredients ri where ri.recipe_id = recipes.id)`,
        })
        .from(recipes)
        .where(
          and(
            mine,
            tag?.trim() ? sql`exists (select 1 from recipe_tags rt where rt.recipe_id = recipes.id and rt.tag = ${tag.trim().toLowerCase()})` : undefined,
            search?.trim()
              ? or(
                  like(recipes.name, pattern),
                  sql`exists (select 1 from recipe_ingredients ri join products p on p.id = ri.product_id
                              where ri.recipe_id = recipes.id and p.name like ${pattern})`,
                )
              : undefined,
          ),
        )
        .orderBy(recipes.name)
        .all();
      const tags = db.select().from(recipeTags).all();
      return rows.map((r) => ({ ...r, tags: tags.filter((t) => t.recipeId === r.id).map((t) => t.tag) }));
    },

    get(id: number) {
      const recipe = db.select().from(recipes).where(and(mine, eq(recipes.id, id))).get();
      if (!recipe) throw new NotFoundError('Recipe', id);
      const ingredients = db
        .select({
          id: recipeIngredients.id,
          productId: recipeIngredients.productId,
          name: products.name,
          quantity: recipeIngredients.quantity,
          unit: recipeIngredients.unit,
          note: recipeIngredients.note,
          toTaste: recipeIngredients.toTaste,
        })
        .from(recipeIngredients)
        .innerJoin(products, eq(products.id, recipeIngredients.productId))
        .where(eq(recipeIngredients.recipeId, id))
        .orderBy(recipeIngredients.id)
        .all();
      const steps = db
        .select({
          position: recipeSteps.position,
          text: recipeSteps.text,
          durationMinutes: recipeSteps.durationMinutes,
          temperatureC: recipeSteps.temperatureC,
          appliance: recipeSteps.appliance,
        })
        .from(recipeSteps)
        .where(eq(recipeSteps.recipeId, id))
        .orderBy(asc(recipeSteps.position))
        .all();
      const tags = db.select({ tag: recipeTags.tag }).from(recipeTags).where(eq(recipeTags.recipeId, id)).orderBy(recipeTags.tag).all();
      return { ...recipe, ingredients, steps, tags: tags.map((t) => t.tag) };
    },

    create({ ingredients, steps, tags, ...data }: z.input<typeof recipeCreate>) {
      const id = db.transaction(() => {
        const row = db
          .insert(recipes)
          .values({ ...data, servings: data.servings ?? 4, householdId: hid })
          .returning()
          .get();
        insertIngredients(row.id, ingredients ?? []);
        insertSteps(row.id, steps ?? []);
        insertTags(row.id, tags ?? []);
        return row.id;
      });
      return svc.get(id);
    },

    /** Creates several recipes in one go (all or nothing). */
    createMany(list: z.input<typeof recipeCreate>[]) {
      return db.transaction(() => list.map((r) => svc.create(r)));
    },

    update({ id, ingredients, steps, tags, ...patch }: z.input<typeof recipeUpdate>) {
      const recipeId = id as number;
      svc.get(recipeId);
      db.transaction(() => {
        if (Object.keys(patch).length) db.update(recipes).set(patch).where(and(mine, eq(recipes.id, recipeId))).run();
        if (ingredients) {
          db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)).run();
          insertIngredients(recipeId, ingredients);
        }
        if (steps) {
          db.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId)).run();
          insertSteps(recipeId, steps);
        }
        if (tags) {
          db.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId)).run();
          insertTags(recipeId, tags);
        }
      });
      return svc.get(recipeId);
    },

    remove(id: number) {
      svc.get(id);
      db.delete(recipes).where(and(mine, eq(recipes.id, id))).run();
    },

    /**
     * Compares what a recipe needs (scaled to `servings`) with what is in stock. Staples and
     * "to taste" ingredients are never missing; "plenty of it" stock covers any quantity.
     */
    availability({ id, servings }: z.infer<typeof recipeAvailability>) {
      const recipe = svc.get(id);
      const scale = (servings ?? recipe.servings) / recipe.servings;
      const snap = stock.snapshot();
      const byId = new Map(productService.list().map((p) => [p.id, p]));
      const ingredients = recipe.ingredients.map((ing) => {
        const product = byId.get(ing.productId)!;
        const needed = round(ing.quantity * scale);
        const base = { name: ing.name, unit: ing.unit, needed };
        if (ing.toTaste) return { ...base, inStock: 0, missing: 0, toTaste: true as const };
        if (product.isStaple) return { ...base, inStock: needed, missing: 0, staple: true as const };
        if (snap.hasApproximate(product.id)) return { ...base, inStock: needed, missing: 0, approximate: true as const };
        const inStock = snap.available(product, ing.unit);
        return { ...base, inStock, missing: round(Math.max(0, needed - inStock)) };
      });
      return {
        recipeId: recipe.id,
        name: recipe.name,
        servings: servings ?? recipe.servings,
        canCook: ingredients.every((i) => i.missing === 0),
        ingredients,
      };
    },

    /**
     * "What can I cook that uses up what is about to expire?" Ranks recipes by how many of the
     * expiring (or explicitly requested) products they use, then by how little needs buying.
     */
    suggest({ withinDays, products: wanted, tag, servings, limit }: z.input<typeof suggestRecipes>) {
      const targets = new Map<number, { name: string; expiresOn: string | null }>();
      for (const item of stock.list({ expiringWithinDays: withinDays ?? 5 }))
        if (!targets.has(item.productId)) targets.set(item.productId, { name: item.name, expiresOn: item.expiresOn });
      for (const name of wanted ?? []) {
        const product = productService.findByName(name);
        if (product && !targets.has(product.id)) targets.set(product.id, { name: product.name, expiresOn: null });
      }
      const servingsToUse = servings ?? settings.get().defaultServings;
      const suggestions = svc
        .list({ tag })
        .map((summary) => {
          const recipe = svc.get(summary.id);
          const uses = recipe.ingredients.filter((i) => !i.toTaste && targets.has(i.productId)).map((i) => targets.get(i.productId)!);
          const availability = svc.availability({ id: recipe.id, servings: servingsToUse });
          const missing = availability.ingredients.filter((i) => i.missing > 0).map((i) => ({ name: i.name, unit: i.unit, missing: i.missing }));
          return {
            recipeId: recipe.id,
            name: recipe.name,
            tags: recipe.tags,
            prepMinutes: recipe.prepMinutes,
            cookMinutes: recipe.cookMinutes,
            usesExpiring: uses,
            canCook: availability.canCook,
            missing,
            score: uses.length * 10 - missing.length * 3 + (availability.canCook ? 5 : 0),
          };
        })
        .filter((s) => s.usesExpiring.length > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, limit ?? 5);
      return { expiring: [...targets.values()], suggestions };
    },
  };
  return svc;
}

export type RecipeService = ReturnType<typeof createRecipeService>;
