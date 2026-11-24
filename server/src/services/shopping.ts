import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { type Location, mealPlan, products, recipes, shoppingItemMeals, shoppingItems } from '../db/schema.js';
import { roundToPacks } from '../domain/buyFormat.js';
import { guessCategory } from '../domain/categories.js';
import { convertQuantity, toDrainedFrame, toNetFrame } from '../domain/convert.js';
import { addDays, today } from '../domain/dates.js';
import { NotFoundError } from '../domain/errors.js';
import { costCents, toCents } from '../domain/pricing.js';
import type { shoppingAdd, shoppingComplete, shoppingGenerate } from '../domain/schemas.js';
import { shownPrice } from '../domain/unitPrice.js';
import { normalizeUnit, round, toBase } from '../domain/units.js';
import type { BudgetService } from './budget.js';
import type { PlannerService } from './planner.js';
import type { ProductService } from './products.js';
import type { RecipeService } from './recipes.js';
import type { SeasonService } from './seasons.js';
import { type StockService, stockKey } from './stock.js';

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
        neededQuantity: shoppingItems.neededQuantity,
        location: shoppingItems.location,
        defaultLocation: products.defaultLocation,
        buyPackSize: products.buyPackSize,
        buyPackUnit: products.buyPackUnit,
        buyLoose: products.buyLoose,
        unitPrice: products.unitPrice,
        priceUnit: products.priceUnit,
        gramsPerPiece: products.gramsPerPiece,
        gramsPerMl: products.gramsPerMl,
      })
      .from(shoppingItems)
      .innerJoin(products, eq(products.id, shoppingItems.productId));

  type Row = ReturnType<ReturnType<typeof view>['all']>[number];
  /** Adds `estimatedCents`: the entered price, else quantity x last known unit price, else null. */
  const decorate = ({
    unitPrice,
    priceUnit,
    gramsPerPiece,
    gramsPerMl,
    buyPackSize,
    buyPackUnit,
    buyLoose,
    defaultLocation,
    neededQuantity,
    ...row
  }: Row) => {
    // Bought in packs: how big one is, how many, and what is left over once the meals are served.
    const packSize = !buyLoose && buyPackSize && buyPackUnit === row.unit ? buyPackSize : null;
    const surplus =
      neededQuantity != null && row.quantity != null && row.quantity > neededQuantity ? round(row.quantity - neededQuantity) : 0;
    const cost = row.quantity != null ? costCents({ unitPrice, priceUnit, gramsPerPiece, gramsPerMl }, row.quantity, row.unit) : null;
    const estimatedCents = row.priceCents ?? (cost !== null ? Math.round(cost) : null);
    // Fruit and vegetables out of season come with in-season alternatives of the same kind.
    const season = seasons.statusOf(row.name);
    return {
      ...row,
      category: row.category ?? guessCategory(row.name),
      needed: neededQuantity,
      packSize,
      packs: packSize && row.quantity != null ? round(row.quantity / packSize) : null,
      surplus,
      /** Where it will be put away: the place chosen on the line, else the product's usual one. */
      storeIn: row.location ?? productService.storageOf({ name: row.name, category: row.category, defaultLocation }),
      estimatedCents,
      pricePer: shownPrice({ unitPrice, priceUnit, gramsPerPiece, gramsPerMl }),
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
      const item = view()
        .where(and(mine, eq(shoppingItems.id, id)))
        .get();
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
        db.update(shoppingItems)
          .set({ quantity: total })
          .where(and(mine, eq(shoppingItems.id, same.id)))
          .run();
        return this.get(same.id);
      }
      const row = db.insert(shoppingItems).values({ householdId: hid, productId: product.id, quantity, unit }).returning().get();
      return this.get(row.id);
    },

    /** Checks or unchecks an item; `price` (major units, null to clear) is what the line cost; `quantity` updates the amount. */
    setChecked(id: number, checked: boolean, price?: number | null, quantity?: number, location?: Location | null) {
      this.get(id);
      db.update(shoppingItems)
        .set({
          checked,
          ...(price !== undefined ? { priceCents: price === null ? null : toCents(price) } : {}),
          ...(quantity !== undefined ? { quantity } : {}),
          ...(location !== undefined ? { location } : {}),
        })
        .where(and(mine, eq(shoppingItems.id, id)))
        .run();
      return this.get(id);
    },

    remove(id: number) {
      this.get(id);
      db.delete(shoppingItems)
        .where(and(mine, eq(shoppingItems.id, id)))
        .run();
    },

    /**
     * Rebuilds the generated part of the list: everything the uncooked planned
     * meals need between two dates, minus what is in stock (other units count when the product has
     * the conversion), plus restocking of products under their minimum. Staples, "to taste"
     * ingredients and products with a "plenty of it" marker are never added; countable items are
     * rounded up to whole pieces. Manually added items are left untouched.
     */
    generateFromPlan({ from, to, includeLowStock }: z.infer<typeof shoppingGenerate>) {
      const needs = new Map<
        string,
        { productId: number; unit: string; mealQuantity: number; lowStockQuantity: number; meals: Map<number, number> }
      >();
      const entryOf = (productId: number, unit: string) => {
        const k = stockKey(productId, unit);
        let entry = needs.get(k);
        if (!entry) {
          entry = { productId, unit, mealQuantity: 0, lowStockQuantity: 0, meals: new Map<number, number>() };
          needs.set(k, entry);
        }
        return entry;
      };
      const needMeal = (productId: number, unit: string, quantity: number, mealId: number) => {
        const entry = entryOf(productId, unit);
        entry.mealQuantity += quantity;
        entry.meals.set(mealId, (entry.meals.get(mealId) ?? 0) + quantity);
      };

      for (const meal of planner.list({ from, to })) {
        if (!meal.recipeId || meal.cooked) continue;
        const recipe = recipeService.get(meal.recipeId);
        for (const ing of recipe.ingredients)
          if (!ing.toTaste) needMeal(ing.productId, ing.unit, (ing.quantity * meal.servings) / recipe.servings, meal.id);
      }
      if (includeLowStock) {
        for (const p of productService.list())
          if (p.minStock != null) entryOf(p.id, p.defaultUnit).lowStockQuantity += toDrainedFrame(p, p.minStock, p.defaultUnit);
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
        // The same stock must not cover two needs of one product in different units (2 pieces and 300 g of the
        // same thing): what an earlier need already claimed is taken off before the next one is compared.
        const claimed = new Map<number, { quantity: number; unit: string }[]>();
        for (const [k, n] of needs) {
          const product = byId.get(n.productId)!;
          if (product.isStaple || snap.hasApproximate(product.id)) continue;
          const totalNeed = n.mealQuantity + n.lowStockQuantity;
          const taken = (claimed.get(product.id) ?? []).reduce(
            (sum, c) => sum + (convertQuantity(c.quantity, c.unit, n.unit, product) ?? 0),
            0,
          );
          const free = Math.max(0, snap.available(product, n.unit) - taken);
          const short = round(totalNeed - free);
          claimed.set(product.id, [...(claimed.get(product.id) ?? []), { quantity: Math.min(totalNeed, free), unit: n.unit }]);
          // Nobody buys 0.25 of a lemon: round countable items up to whole pieces.
          const missing = n.unit === 'piece' ? Math.ceil(short - 1e-9) : short;
          if (missing > 0) {
            // Bought by the label: 125 g of drained beans are 200 g net.
            let quantity = round(toNetFrame(product, missing, n.unit));
            let unit = n.unit;
            let needed: number | null = null;
            // A product bought in packs (eggs by 6, skyr 450 g) is rounded up to whole packs; the rest is surplus.
            if (!product.buyLoose && product.buyPackSize && product.buyPackUnit) {
              const inPackUnit = convertQuantity(quantity, n.unit, product.buyPackUnit, product);
              if (inPackUnit !== null) {
                const rounded = roundToPacks(inPackUnit, product.buyPackSize).quantity;
                if (rounded > inPackUnit + 1e-9) needed = round(inPackUnit);
                quantity = rounded;
                unit = product.buyPackUnit;
              }
            }
            const line = db
              .insert(shoppingItems)
              .values({
                householdId: hid,
                productId: n.productId,
                quantity,
                unit,
                source: 'plan',
                neededQuantity: needed,
                priceCents: prices.get(stockKey(n.productId, unit)) ?? prices.get(k) ?? null,
              })
              .returning()
              .get();
            // Attribute to meals only what stock did not cover for the meals themselves, never diluted by minStock.
            const mealShort = n.mealQuantity > 0 ? Math.max(0, round(n.mealQuantity - free)) : 0;
            const mealAttributed = n.unit === 'piece' ? Math.min(missing, Math.ceil(mealShort - 1e-9)) : Math.min(missing, mealShort);
            if (mealAttributed > 0) {
              for (const [mealId, q] of n.meals)
                db.insert(shoppingItemMeals)
                  .values({ shoppingItemId: line.id, mealId, quantity: round((q / n.mealQuantity) * mealAttributed) })
                  .run();
            }
          }
        }
      });
      return this.list();
    },

    /**
     * Fresh food that will go off before a planned meal gets to it (eggs expiring on Monday, a recipe on Thursday).
     * A pure read, over the meals planned in the next `horizonDays` days that are not cooked yet.
     */
    wasteRisks(horizonDays = 14) {
      const from = today();
      const firstUse = new Map<number, { date: string; title: string }>();
      for (const meal of planner.list({ from, to: addDays(from, horizonDays) })) {
        if (!meal.recipeId || meal.cooked) continue;
        const recipe = recipeService.get(meal.recipeId);
        for (const ing of recipe.ingredients)
          if (!ing.toTaste && !firstUse.has(ing.productId)) firstUse.set(ing.productId, { date: meal.date, title: recipe.name });
      }
      return stock
        .list()
        .flatMap((line) => {
          const use = firstUse.get(line.productId);
          if (!use || line.approximate || !line.expiresOn || line.expiresOn < from || line.expiresOn >= use.date) return [];
          return [
            {
              stockId: line.id,
              productId: line.productId,
              name: line.name,
              quantity: line.quantity,
              unit: line.unit,
              expiresOn: line.expiresOn,
              nextUseOn: use.date,
              nextUseMeal: use.title,
            },
          ];
        })
        .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    },

    /**
     * Something bought outside the list's own flow (typed in after shopping): takes it off the list. The same unit
     * lowers the quantity waiting, anything else (a list in g, a purchase in pieces) counts the article as bought.
     * Returns how many list lines were touched.
     */
    consume(productId: number, quantity: number, unit: string) {
      let left = quantity;
      let touched = 0;
      const lines = db
        .select()
        .from(shoppingItems)
        .where(and(mine, eq(shoppingItems.productId, productId)))
        .orderBy(shoppingItems.id)
        .all();
      for (const line of lines) {
        if (left <= 0) break;
        if (line.quantity !== null && line.unit === unit) {
          if (line.quantity > left) {
            db.update(shoppingItems)
              .set({ quantity: round(line.quantity - left) })
              .where(and(mine, eq(shoppingItems.id, line.id)))
              .run();
            left = 0;
            touched++;
            continue;
          }
          left = round(left - line.quantity);
        }
        db.delete(shoppingItems)
          .where(and(mine, eq(shoppingItems.id, line.id)))
          .run();
        touched++;
      }
      return touched;
    },

    /**
     * Moves every checked item into stock and clears it from the list. When prices were entered
     * (or a total is given) the purchase is also recorded as an expense, which teaches product prices.
     */
    completePurchase(location: Location | undefined, opts: Omit<z.infer<typeof shoppingComplete>, 'location'> = {}) {
      // One transaction for the whole thing: a failed expense must not leave a half-emptied list.
      return db.transaction(() => {
        const bought = this.list().filter((i) => i.checked);
        for (const item of bought) {
          // Put away where asked for the whole trip, else where this line was sent, else the product's usual place.
          const where = location ?? item.storeIn;
          if (location ?? item.location) productService.learnLocation(item.productId, where);
          if (item.quantity != null) productService.learnFormat(item.productId, item.quantity, item.unit);
          stock.add({
            name: item.name,
            quantity: item.quantity ?? 1,
            unit: item.unit,
            location: where,
            price: item.priceCents === null ? undefined : item.priceCents / 100,
          });
          db.delete(shoppingItems)
            .where(and(mine, eq(shoppingItems.id, item.id)))
            .run();
        }
        const priced = bought.filter((i) => i.priceCents !== null);
        const expense =
          priced.length > 0 || (opts.total != null && bought.length > 0)
            ? budget.recordExpense({
                date: opts.date,
                store: opts.store,
                total: opts.total ?? undefined,
                items: priced.map((i) => ({
                  name: i.name,
                  quantity: i.quantity ?? undefined,
                  unit: i.unit,
                  price: (i.priceCents as number) / 100,
                })),
                addToStock: false,
                location: location ?? 'pantry',
              })
            : null;
        return { movedToStock: bought.length, location: location ?? null, expenseId: expense?.id ?? null };
      });
    },
  };
}

export type ShoppingService = ReturnType<typeof createShoppingService>;
