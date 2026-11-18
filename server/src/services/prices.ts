import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { type PriceSource, priceObservations, products } from '../db/schema.js';
import { convertQuantity } from '../domain/convert.js';
import { isHigh, shownPrice, summarize } from '../domain/unitPrice.js';
import type { ProductService } from './products.js';

export interface Observation {
  productId: number;
  /** Cents per 1 `priceUnit`. */
  unitPrice: number;
  priceUnit: string;
  date: string;
  store?: string | null;
  source: PriceSource;
  expenseId?: number | null;
}

/**
 * Price tracking: every price seen for a product is kept, and the latest one feeds `products.unitPrice`
 * (what estimates use). History, averages, trends and shop comparisons are computed from the observations.
 */
export function createPriceService(db: Db, hid: number, productService: ProductService) {
  const mineObs = eq(priceObservations.householdId, hid);

  const svc = {
    /** Keeps one observation. The product's current price follows it unless a more recent one is already known. */
    record(o: Observation) {
      db.insert(priceObservations)
        .values({
          householdId: hid,
          productId: o.productId,
          unitPrice: o.unitPrice,
          priceUnit: o.priceUnit,
          date: o.date,
          store: o.store ?? null,
          source: o.source,
          expenseId: o.expenseId ?? null,
        })
        .run();
      const latest = db
        .select()
        .from(priceObservations)
        .where(and(mineObs, eq(priceObservations.productId, o.productId)))
        .orderBy(desc(priceObservations.date), desc(priceObservations.id))
        .get();
      if (latest)
        db.update(products)
          .set({ unitPrice: latest.unitPrice, priceUnit: latest.priceUnit })
          .where(and(eq(products.householdId, hid), eq(products.id, o.productId)))
          .run();
    },

    /** The price history of a product, in the unit people read (per kg, per litre or per piece). */
    history(productId: number, preloaded?: ReturnType<ProductService['get']>) {
      const product = preloaded ?? productService.get(productId);
      const rows = db
        .select()
        .from(priceObservations)
        .where(and(mineObs, eq(priceObservations.productId, productId)))
        .orderBy(asc(priceObservations.date), asc(priceObservations.id))
        .all();
      // Compared in the unit of the current price; an old price in a unit that cannot be converted is left out.
      const unit = product.priceUnit;
      const comparable = unit
        ? rows.flatMap((r) => {
            const per = convertQuantity(1, r.priceUnit, unit, product);
            return per === null ? [] : [{ ...r, base: r.unitPrice / per }];
          })
        : [];
      const show = (base: number) => shownPrice({ ...product, unitPrice: base, priceUnit: unit });
      const summary = summarize(comparable.map((r) => r.base));
      const at = (n: number | undefined) => {
        const cents = n === undefined ? undefined : show(n)?.main.cents;
        return cents === undefined ? null : Math.round(cents * 100) / 100;
      };

      const stores = new Map<string, number[]>();
      for (const r of comparable) if (r.store) stores.set(r.store, [...(stores.get(r.store) ?? []), r.base]);

      const byStore = [...stores.entries()]
        .map(([store, prices]) => ({
          store,
          latestCents: at(prices.at(-1)),
          averageCents: at(summarize(prices)?.average),
          count: prices.length,
        }))
        .sort((a, b) => (a.latestCents ?? Infinity) - (b.latestCents ?? Infinity));
      const shown = show(product.unitPrice ?? 0);

      return {
        productId,
        name: product.name,
        /** What the cents are per: kg, l or piece. Null while there is no usable price. */
        per: show(product.unitPrice ?? 0)?.main.per ?? null,
        latestCents: at(summary?.latest),
        averageCents: at(summary?.average),
        minCents: at(summary?.min),
        maxCents: at(summary?.max),
        trend: summary?.trend ?? null,
        count: comparable.length,
        /** Another way to read the latest price (eggs per piece and per kg), when the product has the conversion. */
        alternative: show(product.unitPrice ?? 0)?.alt ?? null,
        byStore,
        /** The shop with the lowest latest price, when at least two shops are known. */
        cheapestStore: byStore.length > 1 ? (byStore[0]?.store ?? null) : null,
        /** The latest price is well above the average: worth waiting for a better one. */
        high: shown !== null && isHigh(summary),
        /** A price in a free-form unit (can, pack): followed as typed, but not comparable per kg or litre. */
        freeform:
          shown === null && unit && summary && (product.unitPrice ?? 0) > 0
            ? { unit, latestCents: Math.round(summary.latest), trend: summary.trend }
            : null,
        /** Newest first, at most 30. */
        observations: comparable
          .slice(-30)
          .reverse()
          .map((r) => ({ id: r.id, date: r.date, store: r.store, source: r.source, cents: at(r.base) })),
      };
    },

    /** One line per product that has a price history: trend and whether the latest price is high. For lists and screens. */
    overview() {
      const ids = db.selectDistinct({ id: priceObservations.productId }).from(priceObservations).where(mineObs).all();
      const byId = ids.length ? new Map(productService.list().map((p) => [p.id, p])) : new Map();
      return ids.flatMap(({ id }) => {
        const h = svc.history(id, byId.get(id));
        if (h.count === 0) return [];
        return [
          {
            productId: id,
            name: h.name,
            per: h.per,
            latestCents: h.latestCents,
            averageCents: h.averageCents,
            trend: h.trend,
            high: h.high,
            cheapestStore: h.cheapestStore,
            count: h.count,
          },
        ];
      });
    },
  };
  return svc;
}

export type PriceService = ReturnType<typeof createPriceService>;
