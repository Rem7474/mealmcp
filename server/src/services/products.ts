import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { productAliases, products } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { aliasAdd, productUpdate } from '../domain/schemas.js';
import { normalizeUnit } from '../domain/units.js';

const key = (name: string) => name.trim().toLowerCase();

export function createProductService(db: Db, hid: number) {
  const mine = eq(products.householdId, hid);
  const myAliases = eq(productAliases.householdId, hid);

  const svc = {
    /** Every product with the other names it goes by. */
    list() {
      const rows = db.select().from(products).where(mine).orderBy(products.name).all();
      const aliases = db.select().from(productAliases).where(myAliases).orderBy(productAliases.alias).all();
      return rows.map((p) => ({ ...p, aliases: aliases.filter((a) => a.productId === p.id).map((a) => a.alias) }));
    },

    get(id: number) {
      const p = db.select().from(products).where(and(mine, eq(products.id, id))).get();
      if (!p) throw new NotFoundError('Product', id);
      const aliases = db.select({ alias: productAliases.alias }).from(productAliases).where(and(myAliases, eq(productAliases.productId, id))).all();
      return { ...p, aliases: aliases.map((a) => a.alias) };
    },

    /** Looks a product up by its name or by one of its aliases (case-insensitive). */
    findByName(name: string) {
      const k = key(name);
      const direct = db.select().from(products).where(and(mine, eq(products.nameKey, k))).get();
      if (direct) return direct;
      const viaAlias = db
        .select({ productId: productAliases.productId })
        .from(productAliases)
        .where(and(myAliases, eq(productAliases.aliasKey, k)))
        .get();
      return viaAlias ? db.select().from(products).where(and(mine, eq(products.id, viaAlias.productId))).get() : undefined;
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

    update({ id, name, staple, ...rest }: z.infer<typeof productUpdate>) {
      svc.get(id);
      if (name !== undefined) {
        const clash = svc.findByName(name);
        if (clash && clash.id !== id) throw new ValidationError(`A product named "${name}" already exists`);
      }
      db.update(products)
        .set({
          ...rest,
          ...(staple !== undefined ? { isStaple: staple } : {}),
          ...(name !== undefined ? { name: name.trim(), nameKey: key(name) } : {}),
        })
        .where(and(mine, eq(products.id, id)))
        .run();
      return svc.get(id);
    },

    /** Teaches the app another name for a product, so receipts and recipes using it resolve to the same item. */
    addAlias({ name, alias }: z.infer<typeof aliasAdd>) {
      const product = svc.findByName(name);
      if (!product) throw new NotFoundError('Product', name);
      const clash = svc.findByName(alias);
      if (clash && clash.id !== product.id) throw new ValidationError(`"${alias}" already refers to "${clash.name}"`);
      if (!clash)
        db.insert(productAliases).values({ householdId: hid, productId: product.id, alias: alias.trim(), aliasKey: key(alias) }).run();
      return svc.get(product.id);
    },

    removeAlias(alias: string) {
      const removed = db.delete(productAliases).where(and(myAliases, eq(productAliases.aliasKey, key(alias)))).returning().get();
      if (!removed) throw new NotFoundError('Alias', alias);
    },
  };
  return svc;
}

export type ProductService = ReturnType<typeof createProductService>;
