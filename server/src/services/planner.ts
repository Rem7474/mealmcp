import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { mealPlan, recipes } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { planAdd, planList } from '../domain/schemas.js';
import { round } from '../domain/units.js';
import type { RecipeService } from './recipes.js';
import type { StockService } from './stock.js';

export function createPlannerService(db: Db, hid: number, recipeService: RecipeService, stock: StockService) {
  const mine = eq(mealPlan.householdId, hid);
  const view = () =>
    db
      .select({
        id: mealPlan.id,
        date: mealPlan.date,
        mealType: mealPlan.mealType,
        recipeId: mealPlan.recipeId,
        recipeName: recipes.name,
        title: mealPlan.title,
        servings: mealPlan.servings,
        cooked: mealPlan.cooked,
      })
      .from(mealPlan)
      .leftJoin(recipes, eq(recipes.id, mealPlan.recipeId));

  return {
    list({ from, to }: z.infer<typeof planList>) {
      return view()
        .where(and(mine, gte(mealPlan.date, from), lte(mealPlan.date, to)))
        .orderBy(
          mealPlan.date,
          sql`case ${mealPlan.mealType} when 'breakfast' then 0 when 'lunch' then 1 when 'snack' then 2 else 3 end`,
          mealPlan.id,
        )
        .all();
    },

    get(id: number) {
      const entry = view().where(and(mine, eq(mealPlan.id, id))).get();
      if (!entry) throw new NotFoundError('Planned meal', id);
      return entry;
    },

    add(input: z.infer<typeof planAdd>) {
      const title = input.title?.trim() || null;
      if (!input.recipeId && !title) throw new ValidationError('Provide either recipeId or title');
      const recipe = input.recipeId ? recipeService.get(input.recipeId) : null;
      const row = db
        .insert(mealPlan)
        .values({
          householdId: hid,
          date: input.date,
          mealType: input.mealType,
          recipeId: recipe?.id ?? null,
          title,
          servings: input.servings ?? recipe?.servings ?? 4,
        })
        .returning()
        .get();
      return this.get(row.id);
    },

    remove(id: number) {
      this.get(id);
      db.delete(mealPlan).where(and(mine, eq(mealPlan.id, id))).run();
    },

    /** Marks a meal as cooked and takes its recipe's ingredients out of stock. */
    cook(id: number) {
      const entry = this.get(id);
      if (entry.cooked) throw new ValidationError('This meal is already marked as cooked');
      const usage = db.transaction(() => {
        db.update(mealPlan).set({ cooked: true }).where(and(mine, eq(mealPlan.id, id))).run();
        if (!entry.recipeId) return [];
        const recipe = recipeService.get(entry.recipeId);
        const scale = entry.servings / recipe.servings;
        return recipe.ingredients.map((ing) =>
          stock.consume({ name: ing.name, quantity: round(ing.quantity * scale), unit: ing.unit }),
        );
      });
      return { meal: this.get(id), usage };
    },
  };
}

export type PlannerService = ReturnType<typeof createPlannerService>;
