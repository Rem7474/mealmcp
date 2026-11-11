import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { type Location, products, shoppingItems } from '../db/schema.js';
import { NotFoundError } from '../domain/errors.js';
import type { shoppingAdd, shoppingGenerate } from '../domain/schemas.js';
import { normalizeUnit, round, toBase } from '../domain/units.js';
import type { PlannerService } from './planner.js';
import type { ProductService } from './products.js';
import type { RecipeService } from './recipes.js';
import { stockKey, type StockService } from './stock.js';

export function createShoppingService(
  db: Db,
  hid: number,
  productService: ProductService,
  stock: StockService,
  recipeService: RecipeService,
  planner: PlannerService,
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
      })
      .from(shoppingItems)
      .innerJoin(products, eq(products.id, shoppingItems.productId));

  return {
    list() {
      return view().where(mine).orderBy(shoppingItems.checked, products.category, products.name).all();
    },

    get(id: number) {
      const item = view().where(and(mine, eq(shoppingItems.id, id))).get();
      if (!item) throw new NotFoundError('Shopping item', id);
      return item;
    },

    add(input: z.infer<typeof shoppingAdd>) {
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

    setChecked(id: number, checked: boolean) {
      this.get(id);
      db.update(shoppingItems).set({ checked }).where(and(mine, eq(shoppingItems.id, id))).run();
      return this.get(id);
    },

    remove(id: number) {
      this.get(id);
      db.delete(shoppingItems).where(and(mine, eq(shoppingItems.id, id))).run();
    },

    /**
     * Rebuilds the generated part of the list: everything the uncooked planned
     * meals need between two dates, minus what is in stock, plus restocking of
     * products under their minimum. Manually added items are left untouched.
     */
    generateFromPlan({ from, to, includeLowStock }: z.infer<typeof shoppingGenerate>) {
      const needs = new Map<string, { productId: number; unit: string; quantity: number }>();
      const need = (productId: number, unit: string, quantity: number) => {
        const k = stockKey(productId, unit);
        const entry = needs.get(k) ?? { productId, unit, quantity: 0 };
        entry.quantity += quantity;
        needs.set(k, entry);
      };

      for (const meal of planner.list({ from, to })) {
        if (!meal.recipeId || meal.cooked) continue;
        const recipe = recipeService.get(meal.recipeId);
        for (const ing of recipe.ingredients) need(ing.productId, ing.unit, (ing.quantity * meal.servings) / recipe.servings);
      }
      if (includeLowStock) {
        for (const p of productService.list()) if (p.minStock != null) need(p.id, p.defaultUnit, p.minStock);
      }

      const totals = stock.totals();
      db.transaction(() => {
        db.delete(shoppingItems)
          .where(and(mine, eq(shoppingItems.source, 'plan'), eq(shoppingItems.checked, false)))
          .run();
        for (const [k, n] of needs) {
          const missing = round(n.quantity - (totals.get(k) ?? 0));
          if (missing > 0)
            db.insert(shoppingItems)
              .values({ householdId: hid, productId: n.productId, quantity: missing, unit: n.unit, source: 'plan' })
              .run();
        }
      });
      return this.list();
    },

    /** Moves every checked item into stock and clears it from the list. */
    completePurchase(location: Location = 'pantry') {
      const bought = this.list().filter((i) => i.checked);
      db.transaction(() => {
        for (const item of bought) {
          stock.add({ name: item.name, quantity: item.quantity ?? 1, unit: item.unit, location });
          db.delete(shoppingItems).where(and(mine, eq(shoppingItems.id, item.id))).run();
        }
      });
      return { movedToStock: bought.length, location };
    },
  };
}

export type ShoppingService = ReturnType<typeof createShoppingService>;
