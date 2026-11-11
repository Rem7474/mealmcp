import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { MEAL_TYPES, mealPlan, recipes } from '../db/schema.js';
import { addDays } from '../domain/dates.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { planAdd, planList } from '../domain/schemas.js';
import { round } from '../domain/units.js';
import type { RecipeService } from './recipes.js';
import type { SettingsService } from './settings.js';
import type { StockService } from './stock.js';

const weekdayOf = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 = Sunday
};

export function createPlannerService(db: Db, hid: number, recipeService: RecipeService, stock: StockService, settings: SettingsService) {
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

  const svc = {
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

    add(input: z.input<typeof planAdd>) {
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
          // Explicit servings win, then the household's usual number of eaters, then the recipe's own.
          servings: input.servings ?? settings.get().defaultServings ?? recipe?.servings ?? 4,
        })
        .returning()
        .get();
      return svc.get(row.id);
    },

    /** Plans several meals in one go (all or nothing). */
    addMany(meals: z.input<typeof planAdd>[]) {
      return db.transaction(() => meals.map((m) => svc.add(m)));
    },

    remove(id: number) {
      svc.get(id);
      db.delete(mealPlan).where(and(mine, eq(mealPlan.id, id))).run();
    },

    /**
     * The meals the household expects to plan (see settings.plannedMeals) that have nothing planned yet
     * between two dates: the empty slots an assistant should fill.
     */
    slots({ from, to }: z.infer<typeof planList>) {
      const pattern = settings.get().plannedMeals ?? {};
      const planned = new Set(svc.list({ from, to }).map((m) => `${m.date}|${m.mealType}`));
      const open: { date: string; weekday: number; mealType: (typeof MEAL_TYPES)[number] }[] = [];
      for (let date = from, guard = 0; date <= to && guard < 400; date = addDays(date, 1), guard++) {
        const weekday = weekdayOf(date);
        for (const mealType of MEAL_TYPES)
          if (pattern[mealType]?.includes(weekday) && !planned.has(`${date}|${mealType}`)) open.push({ date, weekday, mealType });
      }
      return open;
    },

    /** Marks a meal as cooked and takes its recipe's ingredients out of stock. */
    cook(id: number) {
      const entry = svc.get(id);
      if (entry.cooked) throw new ValidationError('This meal is already marked as cooked');
      const usage = db.transaction(() => {
        db.update(mealPlan).set({ cooked: true }).where(and(mine, eq(mealPlan.id, id))).run();
        if (!entry.recipeId) return [];
        const recipe = recipeService.get(entry.recipeId);
        const scale = entry.servings / recipe.servings;
        return recipe.ingredients
          .filter((ing) => !ing.toTaste)
          .map((ing) => stock.consume({ name: ing.name, quantity: round(ing.quantity * scale), unit: ing.unit }, { recipeFrame: true }));
      });
      return { meal: svc.get(id), usage };
    },
  };
  return svc;
}

export type PlannerService = ReturnType<typeof createPlannerService>;
