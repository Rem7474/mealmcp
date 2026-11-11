import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { type Location, mealPlan, products, recipes, shoppingItemMeals, shoppingItems } from '../db/schema.js';
import { guessCategory } from '../domain/categories.js';
import { toDrainedFrame, toNetFrame } from '../domain/convert.js';
import { NotFoundError } from '../domain/errors.js';
import { costCents, toCents } from '../domain/pricing.js';
import type { shoppingAdd, shoppingComplete, shoppingGenerate } from '../domain/schemas.js';
import { normalizeUnit, round, toBase } from '../domain/units.js';
import type { BudgetService } from './budget.js';
import type { PlannerService } from './planner.js';
import type { ProductService } from './products.js';
import type { RecipeService } from './recipes.js';
import type { SeasonService } from './seasons.js';
import { stockKey, type StockService } from './stock.js';

export function createShoppingService(
  db: Db,
  hid: number,
  productService: ProductService,
  stock: StockService,
  recipeService: RecipeService,
  planner: PlannerService,
  budget: BudgetService,
  seasons: SeasonService,
) {
  const mine = eq(shoppingItems.householdId, hid);
  const view = () =>
    db
      .select({
        id: shoppingItems.id,
        productId: shoppingItems.productId,
        name: products.name,
        category: products.category,
        quantity: shoppingItems.quantity,
        unit: shoppingItems.unit,
        checked: shoppingItems.checked,
        source: shoppingItems.source,
        priceCents: shoppingItems.priceCents,
        unitPrice: products.unitPrice,
        priceUnit: products.priceUnit,
        gramsPerPiece: products.gramsPerPiece,
        gramsPerMl: products.gramsPerMl,
      })
      .from(shoppingItems)
      .innerJoin(products, eq(products.id, shoppingItems.productId));

  type Row = ReturnType<ReturnType<typeof view>['all']>[number];
  /** Adds `estimatedCents`: the entered price, else quantity x last known unit price, else null. */
  const decorate = ({ unitPrice, priceUnit, gramsPerPiece, gramsPerMl, ...row }: Row) => {
    const cost = row.quantity != null ? costCents({ unitPrice, priceUnit, gramsPerPiece, gramsPerMl }, row.quantity, row.unit) : null;
    const estimatedCents = row.priceCents ?? (cost !== null ? Math.round(cost) : null);
    // Fruit and vegetables out of season come with in-season alternatives of the same kind.
    const season = seasons.statusOf(row.name);
    return {
      ...row,
      category: row.category ?? guessCategory(row.name),
      estimatedCents,
      season: season ? (season.inSeason ? ('in' as const) : ('out' as const)) : null,
      seasonAlternatives: season && !season.inSeason ? seasons.alternativesTo(season.produce) : [],
    };
  };

  type Meal = { id: number; date: string; mealType: string; title: string; recipeId: number | null };
  /** Adds `meals`: the planned meals a generated line is for, earliest first. */
  const withMeals = <T extends { id: number }>(items: T[]) => {
    const links =
      items.length === 0
        ? []
        : db
            .select({
              itemId: shoppingItemMeals.shoppingItemId,
              id: mealPlan.id,
              date: mealPlan.date,
              mealType: mealPlan.mealType,
              title: sql<string>`coalesce(${recipes.name}, ${mealPlan.title}, '')`,
              recipeId: mealPlan.recipeId,
            })
            .from(shoppingItemMeals)
            .innerJoin(mealPlan, eq(mealPlan.id, shoppingItemMeals.mealId))
            .leftJoin(recipes, eq(recipes.id, mealPlan.recipeId))
            .where(
              inArray(
                shoppingItemMeals.shoppingItemId,
                items.map((i) => i.id),
              ),
            )
            .orderBy(mealPlan.date, mealPlan.id)
            .all();
    return items.map((i) => ({
      ...i,
      meals: links.filter((l) => l.itemId === i.id).map(({ itemId: _item, ...meal }): Meal => meal),
    }));
  };

  return {
    list() {
      return withMeals(view().where(mine).orderBy(shoppingItems.checked, products.name).all().map(decorate));
    },

    get(id: number) {
      const item = view().where(and(mine, eq(shoppingItems.id, id))).get();
      if (!item) throw new NotFoundError('Shopping item', id);
      return withMeals([decorate(item)])[0]!;
    },

    /** What the items still to buy should cost, from entered prices and last known product prices. */
    estimate() {
      const open = this.list().filter((i) => !i.checked);
      return {
        currency: budget.household().currency,
        totalCents: open.reduce((sum, i) => sum + (i.estimatedCents ?? 0), 0),
        pricedItems: open.filter((i) => i.estimatedCents !== null).length,
        /** Items with no price information: the total is a lower bound while this is above 0. */
        unpricedItems: open.filter((i) => i.estimatedCents === null).length,
      };
    },

    /** Adds several items in one go (all or nothing). */
    addMany(items: z.input<typeof shoppingAdd>[]) {
      return db.transaction(() => items.map((item) => this.add(item)));
    },

    add(input: z.input<typeof shoppingAdd>) {
      const product = productService.findOrCreate(input.name, input.unit);
      const rawUnit = input.unit ?? product.defaultUnit;
      const quantity = input.quantity != null ? toBase(input.quantity, rawUnit).quantity : null;
      const unit = normalizeUnit(rawUnit);
      // Same article already waiting on the list: add up instead of duplicating.
      const same = db
        .select()
        .from(shoppingItems)
        .where(
          and(
            mine,
            eq(shoppingItems.productId, product.id),
            eq(shoppingItems.unit, unit),
            eq(shoppingItems.checked, false),
            eq(shoppingItems.source, 'manual'),
          ),
        )
        .get();
      if (same) {
        const total = same.quantity == null && quantity == null ? null : round((same.quantity ?? 0) + (quantity ?? 0));
        db.update(shoppingItems).set({ quantity: total }).where(and(mine, eq(shoppingItems.id, same.id))).run();
        return this.get(same.id);
      }
      const row = db.insert(shoppingItems).values({ householdId: hid, productId: product.id, quantity, unit }).returning().get();
      return this.get(row.id);
    },

    /** Checks or unchecks an item; `price` (major units, null to clear) is what the line cost. */
    setChecked(id: number, checked: boolean, price?: number | null) {
      this.get(id);
      db.update(shoppingItems)
        .set({ checked, ...(price !== undefined ? { priceCents: price === null ? null : toCents(price) } : {}) })
        .where(and(mine, eq(shoppingItems.id, id)))
        .run();
      return this.get(id);
    },

    remove(id: number) {
      this.get(id);
      db.delete(shoppingItems).where(and(mine, eq(shoppingItems.id, id))).run();
    },

    /**
     * Rebuilds the generated part of the list: everything the uncooked planned
     * meals need between two dates, minus what is in stock (other units count when the product has
     * the conversion), plus restocking of products under their minimum. Staples, "to taste"
     * ingredients and products with a "plenty of it" marker are never added; countable items are
     * rounded up to whole pieces. Manually added items are left untouched.
     */
    generateFromPlan({ from, to, includeLowStock }: z.infer<typeof shoppingGenerate>) {
      const needs = new Map<string, { productId: number; unit: string; quantity: number; meals: Map<number, number> }>();
      const need = (productId: number, unit: string, quantity: number, mealId?: number) => {
        const k = stockKey(productId, unit);
        const entry = needs.get(k) ?? { productId, unit, quantity: 0, meals: new Map<number, number>() };
        entry.quantity += quantity;
        if (mealId !== undefined) entry.meals.set(mealId, (entry.meals.get(mealId) ?? 0) + quantity);
        needs.set(k, entry);
      };

      for (const meal of planner.list({ from, to })) {
        if (!meal.recipeId || meal.cooked) continue;
        const recipe = recipeService.get(meal.recipeId);
        for (const ing of recipe.ingredients) if (!ing.toTaste) need(ing.productId, ing.unit, (ing.quantity * meal.servings) / recipe.servings, meal.id);
      }
      if (includeLowStock) {
        for (const p of productService.list()) if (p.minStock != null) need(p.id, p.defaultUnit, toDrainedFrame(p, p.minStock, p.defaultUnit));
      }

      const snap = stock.snapshot();
      const byId = new Map(productService.list().map((p) => [p.id, p]));
      db.transaction(() => {
        // Keep prices already entered on generated lines across regenerations.
        const prices = new Map(
          this.list()
            .filter((i) => i.source === 'plan' && !i.checked && i.priceCents !== null)
            .map((i) => [stockKey(i.productId, i.unit), i.priceCents as number]),
        );
        db.delete(shoppingItems)
          .where(and(mine, eq(shoppingItems.source, 'plan'), eq(shoppingItems.checked, false)))
          .run();
        for (const [k, n] of needs) {
          const product = byId.get(n.productId)!;
          if (product.isStaple || snap.hasApproximate(product.id)) continue;
          const short = round(n.quantity - snap.available(product, n.unit));
          // Nobody buys 0.25 of a lemon: round countable items up to whole pieces.
          const missing = n.unit === 'piece' ? Math.ceil(short - 1e-9) : short;
          if (missing > 0) {
            const line = db
              .insert(shoppingItems)
              // Bought by the label: 125 g of drained beans are 200 g net.
              .values({ householdId: hid, productId: n.productId, quantity: round(toNetFrame(product, missing, n.unit)), unit: n.unit, source: 'plan', priceCents: prices.get(k) ?? null })
              .returning()
              .get();
            // What stock does not cover is shared between the meals in proportion to what each needs.
            for (const [mealId, q] of n.meals)
              db.insert(shoppingItemMeals).values({ shoppingItemId: line.id, mealId, quantity: round((q / n.quantity) * missing) }).run();
          }
        }
      });
      return this.list();
    },

    /**
     * Moves every checked item into stock and clears it from the list. When prices were entered
     * (or a total is given) the purchase is also recorded as an expense, which teaches product prices.
     */
    completePurchase(location: Location = 'pantry', opts: Omit<z.infer<typeof shoppingComplete>, 'location'> = {}) {
      const bought = this.list().filter((i) => i.checked);
      db.transaction(() => {
        for (const item of bought) {
          stock.add({ name: item.name, quantity: item.quantity ?? 1, unit: item.unit, location });
          db.delete(shoppingItems).where(and(mine, eq(shoppingItems.id, item.id))).run();
        }
      });
      const priced = bought.filter((i) => i.priceCents !== null);
      const expense =
        priced.length > 0 || (opts.total != null && bought.length > 0)
          ? budget.recordExpense({
              date: opts.date,
              store: opts.store,
              total: opts.total ?? undefined,
              items: priced.map((i) => ({ name: i.name, quantity: i.quantity ?? undefined, unit: i.unit, price: (i.priceCents as number) / 100 })),
              addToStock: false,
              location,
            })
          : null;
      return { movedToStock: bought.length, location, expenseId: expense?.id ?? null };
    },
  };
}

export type ShoppingService = ReturnType<typeof createShoppingService>;
