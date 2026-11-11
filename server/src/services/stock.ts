import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products, stockItems } from '../db/schema.js';
import { addDays, today } from '../domain/dates.js';
import { NotFoundError } from '../domain/errors.js';
import type { stockAdd, stockConsume, stockList, stockUpdate } from '../domain/schemas.js';
import { round, toBase } from '../domain/units.js';
import type { ProductService } from './products.js';

export const stockKey = (productId: number, unit: string) => `${productId}|${unit}`;

export function createStockService(db: Db, hid: number, productService: ProductService) {
  const mine = eq(stockItems.householdId, hid);
  // Note: drizzle's .where() replaces any previous one, so callers always pass `mine` themselves.
  const view = () =>
    db
      .select({
        id: stockItems.id,
        productId: stockItems.productId,
        name: products.name,
        category: products.category,
        quantity: stockItems.quantity,
        unit: stockItems.unit,
        location: stockItems.location,
        expiresOn: stockItems.expiresOn,
        addedOn: stockItems.addedOn,
      })
      .from(stockItems)
      .innerJoin(products, eq(products.id, stockItems.productId));

  // Soonest expiry first, items without a date last.
  const fifo = [sql`${stockItems.expiresOn} is null`, stockItems.expiresOn, stockItems.addedOn] as const;

  return {
    list(filter: z.infer<typeof stockList> = {}) {
      return view()
        .where(
          and(
            mine,
            filter.location ? eq(stockItems.location, filter.location) : undefined,
            filter.expiringWithinDays !== undefined
              ? lte(stockItems.expiresOn, addDays(today(), filter.expiringWithinDays))
              : undefined,
          ),
        )
        .orderBy(...fifo, products.name)
        .all();
    },

    get(id: number) {
      const item = view().where(and(mine, eq(stockItems.id, id))).get();
      if (!item) throw new NotFoundError('Stock item', id);
      return item;
    },

    add(input: z.infer<typeof stockAdd>) {
      const product = productService.findOrCreate(input.name, input.unit);
      const { quantity, unit } = toBase(input.quantity, input.unit ?? product.defaultUnit);
      const expiresOn = input.expiresOn ?? null;
      // Same product, unit, place and expiry: grow the existing line instead of duplicating it.
      const same = db
        .select()
        .from(stockItems)
        .where(
          and(
            mine,
            eq(stockItems.productId, product.id),
            eq(stockItems.unit, unit),
            eq(stockItems.location, input.location),
            expiresOn ? eq(stockItems.expiresOn, expiresOn) : isNull(stockItems.expiresOn),
          ),
        )
        .get();
      if (same) {
        db.update(stockItems)
          .set({ quantity: round(same.quantity + quantity) })
          .where(and(mine, eq(stockItems.id, same.id)))
          .run();
        return this.get(same.id);
      }
      const row = db
        .insert(stockItems)
        .values({ householdId: hid, productId: product.id, quantity, unit, location: input.location, expiresOn, addedOn: today() })
        .returning()
        .get();
      return this.get(row.id);
    },

    /** Returns the updated item, or null when the quantity reached 0 and it was removed. */
    update({ id, ...patch }: z.infer<typeof stockUpdate>) {
      this.get(id);
      if (patch.quantity === 0) {
        this.remove(id);
        return null;
      }
      if (Object.keys(patch).length) db.update(stockItems).set(patch).where(and(mine, eq(stockItems.id, id))).run();
      return this.get(id);
    },

    remove(id: number) {
      this.get(id);
      db.delete(stockItems).where(and(mine, eq(stockItems.id, id))).run();
    },

    /** Takes a quantity out of stock, oldest/soonest-expiring lines first. */
    consume(input: z.infer<typeof stockConsume>) {
      const product = productService.findByName(input.name);
      const { quantity: requested, unit } = toBase(input.quantity, input.unit ?? product?.defaultUnit);
      let remaining = requested;
      if (product) {
        const lines = db
          .select()
          .from(stockItems)
          .where(and(mine, eq(stockItems.productId, product.id), eq(stockItems.unit, unit)))
          .orderBy(...fifo)
          .all();
        for (const line of lines) {
          if (remaining <= 0) break;
          const take = Math.min(line.quantity, remaining);
          remaining = round(remaining - take);
          if (take >= line.quantity) db.delete(stockItems).where(and(mine, eq(stockItems.id, line.id))).run();
          else
            db.update(stockItems)
              .set({ quantity: round(line.quantity - take) })
              .where(and(mine, eq(stockItems.id, line.id)))
              .run();
        }
      }
      return { name: product?.name ?? input.name, unit, requested, consumed: round(requested - remaining), missing: remaining };
    },

    /** Total quantity in stock per product and unit, keyed by stockKey(). */
    totals() {
      const rows = db
        .select({ productId: stockItems.productId, unit: stockItems.unit, total: sql<number>`sum(${stockItems.quantity})` })
        .from(stockItems)
        .where(mine)
        .groupBy(stockItems.productId, stockItems.unit)
        .all();
      return new Map(rows.map((r) => [stockKey(r.productId, r.unit), round(r.total)]));
    },

    lowStock() {
      const totals = this.totals();
      return productService
        .list()
        .filter((p) => p.minStock != null)
        .map((p) => ({
          productId: p.id,
          name: p.name,
          unit: p.defaultUnit,
          current: totals.get(stockKey(p.id, p.defaultUnit)) ?? 0,
          minStock: p.minStock as number,
        }))
        .filter((p) => p.current < p.minStock);
    },

    alerts(expiringWithinDays = 3) {
      return { lowStock: this.lowStock(), expiring: this.list({ expiringWithinDays }) };
    },
  };
}

export type StockService = ReturnType<typeof createStockService>;
