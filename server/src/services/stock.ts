import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products, stockItems } from '../db/schema.js';
import { type Conversions, convertQuantity } from '../domain/convert.js';
import { addDays, today } from '../domain/dates.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
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
        approximate: stockItems.approximate,
      })
      .from(stockItems)
      .innerJoin(products, eq(products.id, stockItems.productId));

  // Soonest expiry first, items without a date last.
  const fifo = [sql`${stockItems.expiresOn} is null`, stockItems.expiresOn, stockItems.addedOn] as const;

  const svc = {
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

    add(input: z.input<typeof stockAdd>) {
      const product = productService.findOrCreate(input.name, input.unit);
      const location = input.location ?? 'pantry';
      const expiresOn = input.expiresOn ?? null;

      if (input.approximate) {
        // One "plenty of it" marker per product and place is enough.
        const marker = db
          .select()
          .from(stockItems)
          .where(and(mine, eq(stockItems.productId, product.id), eq(stockItems.location, location), eq(stockItems.approximate, true)))
          .get();
        if (marker) {
          if (input.expiresOn !== undefined) db.update(stockItems).set({ expiresOn }).where(and(mine, eq(stockItems.id, marker.id))).run();
          return svc.get(marker.id);
        }
        const row = db
          .insert(stockItems)
          .values({ householdId: hid, productId: product.id, quantity: 0, unit: product.defaultUnit, location, expiresOn, addedOn: today(), approximate: true })
          .returning()
          .get();
        return svc.get(row.id);
      }

      if (input.quantity === undefined) throw new ValidationError('quantity is required unless approximate is true');
      const { quantity, unit } = toBase(input.quantity, input.unit ?? product.defaultUnit);
      // Same product, unit, place and expiry: grow the existing line instead of duplicating it.
      const same = db
        .select()
        .from(stockItems)
        .where(
          and(
            mine,
            eq(stockItems.productId, product.id),
            eq(stockItems.unit, unit),
            eq(stockItems.location, location),
            eq(stockItems.approximate, false),
            expiresOn ? eq(stockItems.expiresOn, expiresOn) : isNull(stockItems.expiresOn),
          ),
        )
        .get();
      if (same) {
        db.update(stockItems)
          .set({ quantity: round(same.quantity + quantity) })
          .where(and(mine, eq(stockItems.id, same.id)))
          .run();
        return svc.get(same.id);
      }
      const row = db
        .insert(stockItems)
        .values({ householdId: hid, productId: product.id, quantity, unit, location, expiresOn, addedOn: today() })
        .returning()
        .get();
      return svc.get(row.id);
    },

    /** Adds many lines in one go (all or nothing). */
    addMany(items: z.input<typeof stockAdd>[]) {
      return db.transaction(() => items.map((item) => svc.add(item)));
    },

    /** Returns the updated item, or null when the quantity reached 0 and it was removed. */
    update({ id, ...patch }: z.infer<typeof stockUpdate>) {
      const current = svc.get(id);
      if (patch.quantity === 0 && !current.approximate) {
        svc.remove(id);
        return null;
      }
      if (Object.keys(patch).length) db.update(stockItems).set(patch).where(and(mine, eq(stockItems.id, id))).run();
      return svc.get(id);
    },

    remove(id: number) {
      svc.get(id);
      db.delete(stockItems).where(and(mine, eq(stockItems.id, id))).run();
    },

    /**
     * Takes a quantity out of stock, soonest-expiring lines first. Lines in another unit are used when
     * the product has the conversion. Staples are never used up; "plenty of it" markers are left alone.
     */
    consume(input: z.infer<typeof stockConsume>) {
      const product = productService.findByName(input.name);
      const { quantity: requested, unit } = toBase(input.quantity, input.unit ?? product?.defaultUnit);
      if (product?.isStaple) return { name: product.name, unit, requested, consumed: requested, missing: 0, staple: true };
      let remaining = requested;
      if (product) {
        const lines = db
          .select()
          .from(stockItems)
          .where(and(mine, eq(stockItems.productId, product.id), eq(stockItems.approximate, false)))
          .orderBy(...fifo)
          .all();
        for (const line of lines) {
          if (remaining <= 0) break;
          const wanted = convertQuantity(remaining, unit, line.unit, product); // in the line's unit
          if (wanted === null) continue;
          const take = Math.min(line.quantity, wanted);
          remaining = round(Math.max(0, remaining - (convertQuantity(take, line.unit, unit, product) ?? 0)));
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

    /**
     * A snapshot of what is in stock, to answer "how much do we have of X, in unit Y?" many times
     * with one query. Quantities in other units count when the product has the conversion.
     */
    snapshot() {
      const lines = db.select().from(stockItems).where(mine).all();
      const byProduct = new Map<number, typeof lines>();
      for (const line of lines) byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
      return {
        available(product: { id: number } & Conversions, unit: string): number {
          let total = 0;
          for (const line of byProduct.get(product.id) ?? []) {
            if (line.approximate) continue;
            total += convertQuantity(line.quantity, line.unit, unit, product) ?? 0;
          }
          return round(total);
        },
        /** True when a "plenty of it" marker exists: the product counts as available whatever the quantity. */
        hasApproximate: (productId: number) => (byProduct.get(productId) ?? []).some((l) => l.approximate),
      };
    },

    lowStock() {
      const snap = svc.snapshot();
      return productService
        .list()
        .filter((p) => p.minStock != null && !p.isStaple && !snap.hasApproximate(p.id))
        .map((p) => ({
          productId: p.id,
          name: p.name,
          unit: p.defaultUnit,
          current: snap.available(p, p.defaultUnit),
          minStock: p.minStock as number,
        }))
        .filter((p) => p.current < p.minStock);
    },

    alerts(expiringWithinDays = 3) {
      return { lowStock: svc.lowStock(), expiring: svc.list({ expiringWithinDays }) };
    },
  };
  return svc;
}

export type StockService = ReturnType<typeof createStockService>;
