import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { recipeIngredients, recipes, wasteLog } from '../db/schema.js';
import type { PriceService } from './prices.js';
import type { ProductService } from './products.js';
import type { StockService } from './stock.js';

/** How many waste entries the sheet lists; the totals cover them all. */
const RECENT_WASTE = 10;

/**
 * Everything about one product in a single read: its settings, what is in stock, its price history, what was thrown
 * away and the recipes that use it. Saves an assistant four or five calls before it changes or advises on a product.
 * A pure read.
 */
export function createProductSheetService(db: Db, hid: number, products: ProductService, stock: StockService, prices: PriceService) {
  return {
    get(productId: number) {
      const product = products.get(productId);
      const lines = stock.list().filter((l) => l.productId === productId);
      const snap = stock.snapshot();
      const waste = db
        .select({
          date: wasteLog.date,
          quantity: wasteLog.quantity,
          unit: wasteLog.unit,
          costCents: wasteLog.costCents,
          reason: wasteLog.reason,
        })
        .from(wasteLog)
        .where(and(eq(wasteLog.householdId, hid), eq(wasteLog.productId, productId)))
        .orderBy(desc(wasteLog.date), desc(wasteLog.id))
        .all();
      const usedIn = db
        .selectDistinct({ id: recipes.id, name: recipes.name })
        .from(recipeIngredients)
        .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
        .where(and(eq(recipes.householdId, hid), eq(recipeIngredients.productId, productId)))
        .orderBy(recipes.name)
        .all();
      return {
        product,
        stock: {
          /** Everything at home, in the product default unit (net weight for drained products). */
          total: snap.available(product, product.defaultUnit, true),
          unit: product.defaultUnit,
          /** A "plenty of it" marker exists: the product counts as available whatever the total. */
          plenty: snap.hasApproximate(productId),
          lines,
        },
        price: prices.history(productId, product),
        waste: {
          times: waste.length,
          totalCostCents: waste.reduce((n, w) => n + (w.costCents ?? 0), 0),
          recent: waste.slice(0, RECENT_WASTE),
        },
        usedInRecipes: usedIn,
      };
    },
  };
}

export type ProductSheetService = ReturnType<typeof createProductSheetService>;
