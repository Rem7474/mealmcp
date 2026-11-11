import { and, eq, like, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products, recipeIngredients, recipes } from '../db/schema.js';
import { NotFoundError } from '../domain/errors.js';
import type { recipeAvailability, recipeCreate, recipeUpdate } from '../domain/schemas.js';
import { round, toBase } from '../domain/units.js';
import type { ProductService } from './products.js';
import { stockKey, type StockService } from './stock.js';

type IngredientInput = z.infer<typeof recipeCreate>['ingredients'];

export function createRecipeService(db: Db, hid: number, productService: ProductService, stock: StockService) {
  const mine = eq(recipes.householdId, hid);
  const insertIngredients = (recipeId: number, ingredients: IngredientInput) => {
    for (const ing of ingredients) {
      const product = productService.findOrCreate(ing.name, ing.unit);
      const { quantity, unit } = toBase(ing.quantity, ing.unit ?? product.defaultUnit);
      db.insert(recipeIngredients)
        .values({ recipeId, productId: product.id, quantity, unit, note: ing.note ?? null })
        .run();
    }
  };

  return {
    list(search?: string) {
      const pattern = `%${search?.trim() ?? ''}%`;
      return db
        .select({
          id: recipes.id,
          name: recipes.name,
          description: recipes.description,
          servings: recipes.servings,
          prepMinutes: recipes.prepMinutes,
          // Table names are written out: drizzle leaves columns unqualified in single-table selects.
          ingredientCount: sql<number>`(select count(*) from recipe_ingredients ri where ri.recipe_id = recipes.id)`,
        })
        .from(recipes)
        .where(
          and(
            mine,
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
        })
        .from(recipeIngredients)
        .innerJoin(products, eq(products.id, recipeIngredients.productId))
        .where(eq(recipeIngredients.recipeId, id))
        .orderBy(recipeIngredients.id)
        .all();
      return { ...recipe, ingredients };
    },

    create({ ingredients, ...data }: z.infer<typeof recipeCreate>) {
      const id = db.transaction(() => {
        const row = db.insert(recipes).values({ ...data, householdId: hid }).returning().get();
        insertIngredients(row.id, ingredients);
        return row.id;
      });
      return this.get(id);
    },

    update({ id, ingredients, ...patch }: z.infer<typeof recipeUpdate>) {
      this.get(id);
      db.transaction(() => {
        if (Object.keys(patch).length) db.update(recipes).set(patch).where(and(mine, eq(recipes.id, id))).run();
        if (ingredients) {
          db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).run();
          insertIngredients(id, ingredients);
        }
      });
      return this.get(id);
    },

    remove(id: number) {
      this.get(id);
      db.delete(recipes).where(and(mine, eq(recipes.id, id))).run();
    },

    /** Compares what a recipe needs (scaled to `servings`) with what is in stock. */
    availability({ id, servings }: z.infer<typeof recipeAvailability>) {
      const recipe = this.get(id);
      const scale = (servings ?? recipe.servings) / recipe.servings;
      const totals = stock.totals();
      const ingredients = recipe.ingredients.map((ing) => {
        const needed = round(ing.quantity * scale);
        const inStock = totals.get(stockKey(ing.productId, ing.unit)) ?? 0;
        return { name: ing.name, unit: ing.unit, needed, inStock, missing: round(Math.max(0, needed - inStock)) };
      });
      return {
        recipeId: recipe.id,
        name: recipe.name,
        servings: servings ?? recipe.servings,
        canCook: ingredients.every((i) => i.missing === 0),
        ingredients,
      };
    },
  };
}

export type RecipeService = ReturnType<typeof createRecipeService>;
