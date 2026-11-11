import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { products } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import type { productUpdate } from '../domain/schemas.js';
import { normalizeUnit } from '../domain/units.js';

const key = (name: string) => name.trim().toLowerCase();

export function createProductService(db: Db, hid: number) {
  const mine = eq(products.householdId, hid);

  return {
    list() {
      return db.select().from(products).where(mine).orderBy(products.name).all();
    },

    get(id: number) {
      const p = db.select().from(products).where(and(mine, eq(products.id, id))).get();
      if (!p) throw new NotFoundError('Product', id);
      return p;
    },

    findByName(name: string) {
      return db.select().from(products).where(and(mine, eq(products.nameKey, key(name)))).get();
    },

    /** Products are created on the fly the first time a name is used. */
    findOrCreate(name: string, unit?: string | null) {
      const existing = this.findByName(name);
      if (existing) return existing;
      return db
        .insert(products)
        .values({ householdId: hid, name: name.trim(), nameKey: key(name), defaultUnit: normalizeUnit(unit) })
        .returning()
        .get();
    },

    update({ id, name, ...rest }: z.infer<typeof productUpdate>) {
      this.get(id);
      if (name !== undefined) {
        const clash = this.findByName(name);
        if (clash && clash.id !== id) throw new ValidationError(`A product named "${name}" already exists`);
      }
      return db
        .update(products)
        .set({ ...rest, ...(name !== undefined ? { name: name.trim(), nameKey: key(name) } : {}) })
        .where(and(mine, eq(products.id, id)))
        .returning()
        .get();
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
