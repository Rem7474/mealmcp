import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { equipment } from '../db/schema.js';
import { NotFoundError } from '../domain/errors.js';
import type { equipmentAdd, equipmentUpdate } from '../domain/schemas.js';

const key = (name: string) => name.trim().toLowerCase();

/** The appliances and utensils a household owns, and the ones its recipes ask for. */
export function createEquipmentService(db: Db, hid: number) {
  const mine = eq(equipment.householdId, hid);

  const svc = {
    list() {
      return db.select().from(equipment).where(mine).orderBy(equipment.kind, equipment.name).all();
    },

    get(id: number) {
      const row = db.select().from(equipment).where(and(mine, eq(equipment.id, id))).get();
      if (!row) throw new NotFoundError('Equipment', id);
      return row;
    },

    findByName(name: string) {
      return db.select().from(equipment).where(and(mine, eq(equipment.nameKey, key(name)))).get();
    },

    /** Adds an item, or updates the existing one with the same name (so "I have a mandoline" is idempotent). */
    add({ name, kind, owned }: z.input<typeof equipmentAdd>) {
      const existing = svc.findByName(name);
      if (existing) return svc.update({ id: existing.id, kind: kind ?? existing.kind, owned: owned ?? true });
      return db
        .insert(equipment)
        .values({ householdId: hid, name: name.trim(), nameKey: key(name), kind: kind ?? 'utensil', owned: owned ?? true })
        .returning()
        .get();
    },

    /** Used by recipes: an unknown item is recorded as "not owned" until the household says otherwise. */
    findOrCreate(name: string, kind: 'appliance' | 'utensil' = 'utensil') {
      return svc.findByName(name) ?? svc.add({ name, kind, owned: false });
    },

    update({ id, name, ...patch }: z.input<typeof equipmentUpdate>) {
      const row = svc.get(id as number);
      const change = { ...patch, ...(name !== undefined ? { name: name.trim(), nameKey: key(name) } : {}) };
      if (Object.keys(change).length) db.update(equipment).set(change).where(and(mine, eq(equipment.id, row.id))).run();
      return svc.get(row.id);
    },

    remove(id: number) {
      svc.get(id);
      db.delete(equipment).where(and(mine, eq(equipment.id, id))).run();
    },
  };
  return svc;
}

export type EquipmentService = ReturnType<typeof createEquipmentService>;
