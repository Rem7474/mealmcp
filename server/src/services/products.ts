import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { productAliases, productBarcodes, products } from '../db/schema.js';
import { normalizeGtin } from '../domain/barcode.js';
import { guessCategory } from '../domain/categories.js';
import type { Allergen } from '../domain/diet.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { ProductNutrition } from '../domain/nutrition.js';
import type { aliasAdd, productUpdate, productUpdateByRef } from '../domain/schemas.js';
import { shownPrice } from '../domain/unitPrice.js';
import { normalizeUnit } from '../domain/units.js';

const key = (name: string) => name.trim().toLowerCase();

/** One barcode of a product, with what is known about that format. */
export interface BarcodeView {
  code: string;
  brand: string | null;
  packSize: number | null;
  unit: string | null;
  label: string | null;
}
export interface BarcodeInfo {
  brand?: string | null;
  packSize?: number | null;
  unit?: string | null;
  label?: string | null;
}

/** The stored JSON list of allergens, or null when the product has none recorded (the name-based guess applies). */
const parseAllergens = (json: string | null): Allergen[] | null => {
  try {
    return json ? (JSON.parse(json) as Allergen[]) : null;
  } catch {
    return null;
  }
};
const parseNutrition = (json: string | null): ProductNutrition | null => {
  try {
    return json ? (JSON.parse(json) as ProductNutrition) : null;
  } catch {
    return null;
  }
};
const shapeProduct = <
  T extends {
    allergens: string | null;
    nutrition: string | null;
    name: string;
    unitPrice: number | null;
    priceUnit: string | null;
    gramsPerPiece: number | null;
    gramsPerMl: number | null;
  },
>(
  p: T,
  aliases: string[],
  barcodes: BarcodeView[] = [],
) => ({
  ...p,
  /** The first barcode, kept for callers that read one; the full list is `barcodes` (the old column is no longer written). */
  barcode: barcodes[0]?.code ?? null,
  barcodes,
  allergens: parseAllergens(p.allergens),
  nutrition: parseNutrition(p.nutrition),
  suggestedCategory: guessCategory(p.name),
  /** The last known price in the unit people read (per kg, litre or piece), plus an alternative when convertible. */
  pricePer: shownPrice(p),
  aliases,
});

export function createProductService(db: Db, hid: number) {
  const mine = eq(products.householdId, hid);
  const myAliases = eq(productAliases.householdId, hid);
  const myBarcodes = eq(productBarcodes.householdId, hid);
  const viewOf = (b: typeof productBarcodes.$inferSelect): BarcodeView => ({
    code: b.code,
    brand: b.brand,
    packSize: b.packSize,
    unit: b.unit,
    label: b.label,
  });

  const svc = {
    /** Every product with the other names it goes by. */
    list() {
      const rows = db.select().from(products).where(mine).orderBy(products.name).all();
      const aliases = db.select().from(productAliases).where(myAliases).orderBy(productAliases.alias).all();
      const codes = db.select().from(productBarcodes).where(myBarcodes).orderBy(productBarcodes.id).all();
      return rows.map((p) =>
        shapeProduct(
          p,
          aliases.filter((a) => a.productId === p.id).map((a) => a.alias),
          codes.filter((b) => b.productId === p.id).map(viewOf),
        ),
      );
    },

    get(id: number) {
      const p = db
        .select()
        .from(products)
        .where(and(mine, eq(products.id, id)))
        .get();
      if (!p) throw new NotFoundError('Product', id);
      const aliases = db
        .select({ alias: productAliases.alias })
        .from(productAliases)
        .where(and(myAliases, eq(productAliases.productId, id)))
        .all();
      return shapeProduct(
        p,
        aliases.map((a) => a.alias),
        svc.barcodesOf(id),
      );
    },

    barcodesOf(productId: number): BarcodeView[] {
      return db
        .select()
        .from(productBarcodes)
        .where(and(myBarcodes, eq(productBarcodes.productId, productId)))
        .orderBy(productBarcodes.id)
        .all()
        .map(viewOf);
    },

    /** The product (and the format) a barcode belongs to in this household, or undefined. */
    findByBarcode(code: string) {
      const gtin = normalizeGtin(code);
      if (!gtin) return undefined;
      const b = db
        .select()
        .from(productBarcodes)
        .where(and(myBarcodes, eq(productBarcodes.code, gtin)))
        .get();
      if (!b) return undefined;
      const product = db
        .select()
        .from(products)
        .where(and(mine, eq(products.id, b.productId)))
        .get();
      return product ? { product, barcode: viewOf(b) } : undefined;
    },

    /**
     * Links a barcode to a product (a product has many: one per format or brand). A code already linked to another
     * product is refused. Linking it again to the same product only fills in what was missing or changed.
     */
    attachBarcode(productId: number, code: string, info: BarcodeInfo = {}): BarcodeView {
      const gtin = normalizeGtin(code);
      if (!gtin) throw new ValidationError('Expected a barcode (digits only)');
      const product = svc.get(productId);
      const taken = svc.findByBarcode(gtin);
      if (taken && taken.product.id !== productId) throw new ValidationError(`That barcode already belongs to "${taken.product.name}"`);
      const fields = {
        ...(info.brand !== undefined ? { brand: info.brand } : {}),
        ...(info.packSize !== undefined ? { packSize: info.packSize } : {}),
        ...(info.unit !== undefined ? { unit: info.unit } : {}),
        ...(info.label !== undefined ? { label: info.label } : {}),
      };
      if (taken) {
        if (Object.keys(fields).length > 0)
          db.update(productBarcodes)
            .set(fields)
            .where(and(myBarcodes, eq(productBarcodes.code, gtin)))
            .run();
      } else {
        db.insert(productBarcodes)
          .values({ householdId: hid, productId, code: gtin, ...fields })
          .run();
      }
      if (info.brand && !product.brand)
        db.update(products)
          .set({ brand: info.brand })
          .where(and(mine, eq(products.id, productId)))
          .run();
      return svc.barcodesOf(productId).find((b) => b.code === gtin) as BarcodeView;
    },

    detachBarcodes(productId: number) {
      db.delete(productBarcodes)
        .where(and(myBarcodes, eq(productBarcodes.productId, productId)))
        .run();
    },

    /** Another name for a product, kept only when it is free: an alias that belongs to another product is skipped. */
    ensureAlias(productId: number, alias: string | null | undefined) {
      const name = alias?.trim();
      if (!name || svc.findByName(name)) return;
      db.insert(productAliases)
        .values({ householdId: hid, productId, alias: name, aliasKey: key(name) })
        .run();
    },

    /** Looks a product up by its name or by one of its aliases (case-insensitive). */
    findByName(name: string) {
      const k = key(name);
      const direct = db
        .select()
        .from(products)
        .where(and(mine, eq(products.nameKey, k)))
        .get();
      if (direct) return direct;
      const viaAlias = db
        .select({ productId: productAliases.productId })
        .from(productAliases)
        .where(and(myAliases, eq(productAliases.aliasKey, k)))
        .get();
      return viaAlias
        ? db
            .select()
            .from(products)
            .where(and(mine, eq(products.id, viaAlias.productId)))
            .get()
        : undefined;
    },

    /** Products are created on the fly the first time a name is used. */
    findOrCreate(name: string, unit?: string | null) {
      const existing = svc.findByName(name);
      if (existing) return existing;
      return db
        .insert(products)
        .values({ householdId: hid, name: name.trim(), nameKey: key(name), defaultUnit: normalizeUnit(unit) })
        .returning()
        .get();
    },

    update({ id, name, staple, drained, allergens, barcode, ...rest }: z.infer<typeof productUpdate>) {
      if (drained && drained.drainedGrams > drained.netGrams) throw new ValidationError('Drained weight cannot exceed the net weight');
      svc.get(id);
      if (name !== undefined) {
        const clash = svc.findByName(name);
        if (clash && clash.id !== id) throw new ValidationError(`A product named "${name}" already exists`);
      }
      if (barcode) svc.attachBarcode(id, barcode);
      else if (barcode === null) svc.detachBarcodes(id);
      const changes = {
        ...rest,
        ...(staple !== undefined ? { isStaple: staple } : {}),
        ...(allergens !== undefined ? { allergens: allergens === null ? null : JSON.stringify(allergens) } : {}),
        ...(drained !== undefined ? { drainedRatio: drained ? drained.drainedGrams / drained.netGrams : null } : {}),
        ...(name !== undefined ? { name: name.trim(), nameKey: key(name) } : {}),
      };
      if (Object.keys(changes).length > 0)
        db.update(products)
          .set(changes)
          .where(and(mine, eq(products.id, id)))
          .run();
      return svc.get(id);
    },

    /** The id of the product a caller means, by id or by name (or alias). */
    idOf({ id, name }: { id?: number; name?: string }): number {
      if (id !== undefined) return id;
      if (!name) throw new ValidationError('Give a product id or a product name');
      const found = svc.findByName(name);
      if (!found) throw new NotFoundError('Product', name);
      return found.id;
    },

    /** Updates several products in one go (all or nothing); each is given by id or, in `product`, by name. */
    updateMany(items: z.infer<typeof productUpdateByRef>[]) {
      return db.transaction(() =>
        items.map(({ product, id, ...patch }, i) => {
          try {
            return svc.update({ ...patch, id: svc.idOf({ id, name: product }) });
          } catch (e) {
            throw new ValidationError(`Item ${i + 1}: ${e instanceof Error ? e.message : 'failed'}`);
          }
        }),
      );
    },

    /** Teaches the app another name for a product, so receipts and recipes using it resolve to the same item. */
    addAlias({ name, alias }: z.infer<typeof aliasAdd>) {
      const product = svc.findByName(name);
      if (!product) throw new NotFoundError('Product', name);
      const clash = svc.findByName(alias);
      if (clash && clash.id !== product.id) throw new ValidationError(`"${alias}" already refers to "${clash.name}"`);
      if (!clash)
        db.insert(productAliases)
          .values({ householdId: hid, productId: product.id, alias: alias.trim(), aliasKey: key(alias) })
          .run();
      return svc.get(product.id);
    },

    removeAlias(alias: string) {
      const removed = db
        .delete(productAliases)
        .where(and(myAliases, eq(productAliases.aliasKey, key(alias))))
        .returning()
        .get();
      if (!removed) throw new NotFoundError('Alias', alias);
    },
  };
  // Barcodes and the product row change together or not at all.
  const write = svc.update;
  svc.update = (input) => db.transaction(() => write(input));
  return svc;
}

export type ProductService = ReturnType<typeof createProductService>;
