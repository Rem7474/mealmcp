import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products, stockItems } from '../db/schema.js';
import { type Conversions, convertQuantity, type Drainable, toDrainedFrame, toNetFrame } from '../domain/convert.js';
import { addDays, today } from '../domain/dates.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { stockAdd, stockConsume, stockList, stockOpen, stockUpdate } from '../domain/schemas.js';
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
        packSize: stockItems.packSize,
        openedOn: stockItems.openedOn,
      })
      .from(stockItems)
      .innerJoin(products, eq(products.id, stockItems.productId));

  // Soonest expiry first, items without a date last.
  const fifo = [sql`${stockItems.expiresOn} is null`, stockItems.expiresOn, stockItems.addedOn] as const;

  type Row = ReturnType<ReturnType<typeof view>['all']>[number];
  /** Adds `opened` and `packCount` (how many sealed packs a line holds, null when it is not kept in packs). */
  const shape = (r: Row) => ({
    ...r,
    opened: r.openedOn !== null,
    packCount: r.packSize && !r.openedOn && !r.approximate ? Math.round(r.quantity / r.packSize) : null,
  });
  // Opened packs are used first, then the soonest expiry.
  const useFirst = [sql`${stockItems.openedOn} is null`, ...fifo] as const;
  /** When an opened pack must be finished: the product's opened shelf life, but never later than the printed date. */
  const openedExpiry = (shelfLifeDays: number | null | undefined, openedOn: string, printed: string | null) => {
    if (!shelfLifeDays) return printed;
    const limit = addDays(openedOn, shelfLifeDays);
    return printed && printed < limit ? printed : limit;
  };

  const svc = {
    list(filter: z.infer<typeof stockList> = {}) {
      // Lines left at 0 (the quantity is gone) have no reason to exist: "plenty of it" markers are the only ones that hold 0 on purpose.
      db.delete(stockItems).where(and(mine, lte(stockItems.quantity, 0), eq(stockItems.approximate, false))).run();
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
        .all()
        .map(shape);
    },

    get(id: number) {
      const item = view().where(and(mine, eq(stockItems.id, id))).get();
      if (!item) throw new NotFoundError('Stock item', id);
      return shape(item);
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

      // "2 x 500 g": keep the number of packs and their size, not just the total.
      if (input.packCount !== undefined && input.packSize === undefined) throw new ValidationError('packCount needs packSize');
      if (input.packCount !== undefined && input.quantity !== undefined) throw new ValidationError('Give either quantity, or packCount with packSize');
      if (input.opened && (input.packCount ?? 1) > 1) throw new ValidationError('An opened pack is a single pack: use packCount 1 or leave it out');
      const rawUnit = input.unit ?? product.defaultUnit;
      const pack = input.packSize !== undefined ? toBase(input.packSize, rawUnit) : null;
      let quantity: number;
      let unit: string;
      if (pack && input.packCount !== undefined) {
        quantity = round(pack.quantity * input.packCount);
        unit = pack.unit;
      } else {
        if (input.quantity === undefined) throw new ValidationError('quantity is required unless approximate is true or packCount and packSize are given');
        ({ quantity, unit } = toBase(input.quantity, rawUnit));
      }
      const packSize = pack?.quantity ?? null;

      if (input.opened) {
        // An opened pack is its own line: it is used first and expires on its own clock.
        if (packSize !== null && quantity > packSize + 1e-9) throw new ValidationError('An opened pack cannot hold more than its size');
        const openedOn = input.openedOn ?? today();
        const row = db
          .insert(stockItems)
          .values({
            householdId: hid,
            productId: product.id,
            quantity,
            unit,
            location,
            expiresOn: expiresOn ?? openedExpiry(product.openedShelfLifeDays, openedOn, null),
            addedOn: today(),
            packSize,
            openedOn,
          })
          .returning()
          .get();
        return svc.get(row.id);
      }

      // Same product, unit, pack size, place and expiry: grow the existing line instead of duplicating it.
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
            isNull(stockItems.openedOn),
            packSize === null ? isNull(stockItems.packSize) : eq(stockItems.packSize, packSize),
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
        .values({ householdId: hid, productId: product.id, quantity, unit, location, expiresOn, addedOn: today(), packSize })
        .returning()
        .get();
      return svc.get(row.id);
    },

    /**
     * Opens one pack of a line: it becomes its own line, with an opening date and the expiry the product's
     * opened shelf life gives (never later than the printed date). `remaining` is what is left of it.
     */
    open({ id, remaining, shelfLifeDays }: z.infer<typeof stockOpen>) {
      const line = svc.get(id);
      if (line.approximate) throw new ValidationError('A "plenty of it" marker cannot be opened');
      if (line.openedOn) throw new ValidationError('This pack is already opened');
      const product = productService.get(line.productId);
      if (shelfLifeDays && !product.openedShelfLifeDays) productService.update({ id: product.id, openedShelfLifeDays: shelfLifeDays });
      const days = shelfLifeDays ?? product.openedShelfLifeDays;
      const openedOn = today();
      const expiresOn = openedExpiry(days, openedOn, line.expiresOn);
      const size = line.packSize ?? line.quantity;
      if (remaining !== undefined && remaining > size + 1e-9) throw new ValidationError('What is left cannot exceed the pack size');
      const left = remaining ?? size;

      if (line.packSize === null) {
        // Not kept in packs: the line itself is the container.
        db.update(stockItems).set({ openedOn, expiresOn, quantity: left, packSize: line.quantity }).where(and(mine, eq(stockItems.id, id))).run();
        return svc.get(id);
      }
      if (line.quantity < size - 1e-9) throw new ValidationError('This line holds less than one whole pack');
      const rest = round(line.quantity - size);
      if (rest <= 1e-9) db.delete(stockItems).where(and(mine, eq(stockItems.id, id))).run();
      else db.update(stockItems).set({ quantity: rest }).where(and(mine, eq(stockItems.id, id))).run();
      const row = db
        .insert(stockItems)
        .values({ householdId: hid, productId: line.productId, quantity: left, unit: line.unit, location: line.location, expiresOn, addedOn: line.addedOn, packSize: size, openedOn })
        .returning()
        .get();
      return svc.get(row.id);
    },

    /** Adds many lines in one go (all or nothing). */
    addMany(items: z.input<typeof stockAdd>[]) {
      return db.transaction(() => items.map((item) => svc.add(item)));
    },

    /** Returns the updated item, or null when the quantity reached 0 and it was removed. */
    update({ id, packCount, ...patch }: z.infer<typeof stockUpdate>) {
      const current = svc.get(id);
      if (packCount !== undefined) {
        if (!current.packSize || current.openedOn) throw new ValidationError('packCount only applies to a line of sealed packs');
        patch = { ...patch, quantity: round(packCount * current.packSize) };
      }
      // 0 means used up, for a "plenty of it" marker too (which is stored at 0 and would otherwise stay).
      if (patch.quantity === 0) {
        svc.remove(id);
        return null;
      }
      // An exact quantity replaces the "plenty of it" marker.
      const changes = patch.quantity !== undefined && current.approximate ? { ...patch, approximate: false } : patch;
      if (Object.keys(changes).length) db.update(stockItems).set(changes).where(and(mine, eq(stockItems.id, id))).run();
      return svc.get(id);
    },

    remove(id: number) {
      svc.get(id);
      db.delete(stockItems).where(and(mine, eq(stockItems.id, id))).run();
    },

    /**
     * Takes a quantity out of stock: opened packs first, then the soonest expiry. Lines in another unit
     * are used when the product has the conversion. Staples are never used up; "plenty of it" markers are
     * left alone. A sealed pack used in part is opened: what is left becomes an opened line with its own
     * expiry. With `recipeFrame`, grams of a drained product (beans, tuna) are drained grams, so more net
     * grams leave the stock.
     */
    consume(input: z.infer<typeof stockConsume>, opts: { recipeFrame?: boolean } = {}) {
      const product = productService.findByName(input.name);
      const { quantity: requested, unit } = toBase(input.quantity, input.unit ?? product?.defaultUnit);
      if (product?.isStaple) return { name: product.name, unit, requested, consumed: requested, missing: 0, staple: true };
      const needed = opts.recipeFrame && product ? toNetFrame(product, requested, unit) : requested;
      let remaining = needed;
      if (product) {
        const lines = db
          .select()
          .from(stockItems)
          .where(and(mine, eq(stockItems.productId, product.id), eq(stockItems.approximate, false)))
          .orderBy(...useFirst)
          .all();
        for (const line of lines) {
          if (remaining <= 0) break;
          const wanted = convertQuantity(remaining, unit, line.unit, product); // in the line's unit
          if (wanted === null) continue;
          const take = Math.min(line.quantity, wanted);
          remaining = round(Math.max(0, remaining - (convertQuantity(take, line.unit, unit, product) ?? 0)));
          const size = line.packSize;
          if (take >= line.quantity - 1e-9) db.delete(stockItems).where(and(mine, eq(stockItems.id, line.id))).run();
          else if (size && !line.openedOn) {
            // Whole packs go first; a part of a pack opens the next one.
            const whole = Math.floor(take / size + 1e-9);
            const part = round(take - whole * size);
            let left = round(line.quantity - whole * size);
            if (part > 1e-9) {
              left = round(Math.max(0, left - size));
              const openedOn = today();
              db.insert(stockItems)
                .values({
                  householdId: hid,
                  productId: line.productId,
                  quantity: round(size - part),
                  unit: line.unit,
                  location: line.location,
                  expiresOn: openedExpiry(product.openedShelfLifeDays, openedOn, line.expiresOn),
                  addedOn: line.addedOn,
                  packSize: size,
                  openedOn,
                })
                .run();
            }
            if (left <= 1e-9) db.delete(stockItems).where(and(mine, eq(stockItems.id, line.id))).run();
            else db.update(stockItems).set({ quantity: left }).where(and(mine, eq(stockItems.id, line.id))).run();
          } else {
            db.update(stockItems)
              .set({ quantity: round(line.quantity - take) })
              .where(and(mine, eq(stockItems.id, line.id)))
              .run();
          }
        }
      }
      const back = (q: number) => (opts.recipeFrame && product ? round(toDrainedFrame(product, q, unit)) : q);
      return { name: product?.name ?? input.name, unit, requested, consumed: back(round(needed - remaining)), missing: back(remaining) };
    },

    /**
     * A snapshot of what is in stock, to answer "how much do we have of X, in unit Y?" many times
     * with one query. Quantities in other units count when the product has the conversion. For a
     * drained product (beans, tuna) grams are answered as drained grams, the way recipes count them,
     * unless `net` asks for the label weight.
     */
    snapshot() {
      const lines = db.select().from(stockItems).where(mine).all();
      const byProduct = new Map<number, typeof lines>();
      for (const line of lines) byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
      return {
        available(product: { id: number } & Conversions & Drainable, unit: string, net = false): number {
          let total = 0;
          for (const line of byProduct.get(product.id) ?? []) {
            if (line.approximate) continue;
            total += convertQuantity(line.quantity, line.unit, unit, product) ?? 0;
          }
          return round(net ? total : toDrainedFrame(product, total, unit));
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
          current: snap.available(p, p.defaultUnit, true),
          minStock: p.minStock as number,
        }))
        .filter((p) => p.current < p.minStock);
    },

    /** What needs attention: products under their minimum, lines about to expire, and every pack already opened. */
    alerts(expiringWithinDays = 3) {
      const opened = svc.list().filter((i) => i.opened);
      return {
        lowStock: svc.lowStock(),
        expiring: svc.list({ expiringWithinDays }),
        opened: opened.sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999')),
      };
    },
  };
  return svc;
}

export type StockService = ReturnType<typeof createStockService>;
