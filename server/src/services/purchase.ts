import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { ValidationError } from '../domain/errors.js';
import { fold, parseLine, splitLines } from '../domain/purchaseText.js';
import type { purchaseApply } from '../domain/schemas.js';
import { normalizeUnit, toBase } from '../domain/units.js';
import type { BudgetService } from './budget.js';
import type { ProductService } from './products.js';
import type { ShoppingService } from './shopping.js';
import type { StockService } from './stock.js';

const MAX_LINES = 100;

export type PurchaseMatch = 'barcode' | 'name' | 'close' | 'new' | 'unknown';

/**
 * "I did my shopping": a typed list becomes proposed stock lines the person corrects, and `apply` puts them away,
 * takes them off the shopping list and records the expense. No model: each line is matched to the household's own
 * products by barcode, then name or alias, then a close spelling (case, accents, plurals), else it is a new product.
 */
export function createPurchaseService(
  db: Db,
  products: ProductService,
  stock: StockService,
  shopping: ShoppingService,
  budget: BudgetService,
) {
  return {
    /** Reads the text and matches it. A pure read: nothing is written, the person reviews the lines first. */
    parse(text: string) {
      const raw = splitLines(text);
      if (raw.length > MAX_LINES) throw new ValidationError(`Too many lines (at most ${MAX_LINES})`);
      const all = products.list();
      const byFold = new Map<string, (typeof all)[number]>();
      for (const p of all) if (!byFold.has(fold(p.name))) byFold.set(fold(p.name), p);
      const onList = new Set(shopping.list().map((i) => i.productId));

      const lines = raw.flatMap((line) => {
        const parsed = parseLine(line);
        if (!parsed) return [];
        let product = parsed.barcode ? products.findByBarcode(parsed.barcode)?.product : undefined;
        let match: PurchaseMatch = product ? 'barcode' : 'new';
        if (!product && parsed.name) {
          product = products.findByName(parsed.name);
          if (product) match = 'name';
          else {
            product = byFold.get(fold(parsed.name));
            if (product) match = 'close';
          }
        }
        // A barcode nobody knows and no name to go with it: shown, but not kept unless the person names it.
        if (!product && !parsed.name) match = 'unknown';
        return [
          {
            text: parsed.text,
            name: product?.name ?? parsed.name,
            quantity: parsed.quantity ?? 1,
            // "2 milk" is two bottles, not two millilitres: a bare number only borrows the product's unit when it is a countable one.
            unit: parsed.unit ?? (product && !['g', 'ml'].includes(product.defaultUnit) ? product.defaultUnit : 'piece'),
            price: parsed.price,
            match,
            productId: product?.id ?? null,
            onList: product ? onList.has(product.id) : false,
            include: match !== 'unknown',
            ...(match === 'unknown' ? { barcode: parsed.barcode } : {}),
          },
        ];
      });
      return { lines };
    },

    /** Puts the reviewed lines in stock, off the list, and records what they cost. All or nothing. */
    apply({ lines, store, date, total, location }: z.infer<typeof purchaseApply>) {
      return db.transaction(() => {
        let removedFromList = 0;
        for (const line of lines) {
          const added = stock.add({ name: line.name, quantity: line.quantity, unit: line.unit, location });
          const base = toBase(line.quantity, line.unit ?? 'piece');
          removedFromList += shopping.consume(added.productId, base.quantity, normalizeUnit(base.unit));
        }
        const priced = lines.filter((l) => l.price !== undefined);
        const expense =
          priced.length > 0 || total !== undefined
            ? budget.recordExpense({
                date,
                store,
                total,
                items: priced.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit, price: l.price as number })),
                addToStock: false,
                location,
              })
            : null;
        return { addedToStock: lines.length, removedFromList, location, expenseId: expense?.id ?? null };
      });
    },
  };
}

export type PurchaseService = ReturnType<typeof createPurchaseService>;
