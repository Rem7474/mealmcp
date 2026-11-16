import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
const newHousehold = () => db.insert(households).values({ name: 'Test', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, newHousehold());
});

describe('stock line by name', () => {
  it('resolves a product with one line, by name or alias, and an id as given', () => {
    const line = svc.stock.add({ name: 'Chicken', quantity: 500, unit: 'g', location: 'fridge' });
    svc.products.addAlias({ name: 'Chicken', alias: 'poulet' });
    expect(svc.stock.resolve({ name: 'chicken' })).toBe(line.id);
    expect(svc.stock.resolve({ name: 'Poulet' })).toBe(line.id);
    expect(svc.stock.resolve({ id: 999 })).toBe(999);
  });

  it('asks for a name or an id, and knows when the product or its stock is missing', () => {
    expect(() => svc.stock.resolve({})).toThrow(/id or a product name/);
    expect(() => svc.stock.resolve({ name: 'Nothing' })).toThrow(/Nothing/);
    svc.products.findOrCreate('Flour');
    expect(() => svc.stock.resolve({ name: 'Flour' })).toThrow(/no Flour in stock/);
  });

  it('lists the candidates when several lines match, and narrows them with a rule', () => {
    const sealed = svc.stock.add({ name: 'Sauce', quantity: 400, unit: 'g' });
    svc.stock.add({ name: 'Sauce', quantity: 300, unit: 'g', opened: true });
    expect(() => svc.stock.resolve({ name: 'Sauce' })).toThrow(new RegExp(`several stock lines: #${sealed.id} `));
    expect(svc.stock.resolve({ name: 'Sauce' }, (l) => !l.opened)).toBe(sealed.id);
    // A rule that matches nothing falls back to every line, so the answer still lists them.
    expect(() => svc.stock.resolve({ name: 'Sauce' }, () => false)).toThrow(/several/);
  });

  it("never resolves another household's lines", () => {
    svc.stock.add({ name: 'Butter', quantity: 250, unit: 'g' });
    const other = createServices(db, newHousehold());
    expect(() => other.stock.resolve({ name: 'Butter' })).toThrow(/Butter/);
  });
});

describe('bulk updates', () => {
  it('updates several lines by name or id in one go, and a move to the freezer freezes', () => {
    const a = svc.stock.add({ name: 'Peas', quantity: 500, unit: 'g', location: 'fridge' });
    svc.stock.add({ name: 'Fish', quantity: 2, location: 'fridge' });
    const out = svc.stock.updateMany([
      { id: a.id, location: 'freezer' },
      { name: 'Fish', location: 'freezer', note: 'fillets' },
    ]);
    expect(out).toHaveLength(2);
    expect(svc.stock.list().every((l) => l.frozen && l.location === 'freezer')).toBe(true);
    expect(svc.stock.list().find((l) => l.name === 'Fish')?.note).toBe('fillets');
  });

  it('reports a removed line and rolls everything back when one item fails', () => {
    svc.stock.add({ name: 'Rice', quantity: 1000, unit: 'g' });
    svc.stock.add({ name: 'Milk', quantity: 1, unit: 'l' });
    expect(svc.stock.updateMany([{ name: 'Rice', quantity: 0 }])).toEqual([{ removed: true, id: expect.any(Number) }]);
    expect(() =>
      svc.stock.updateMany([
        { name: 'Milk', note: 'ok' },
        { name: 'Ghost', note: 'x' },
      ]),
    ).toThrow(/Item 2/);
    expect(svc.stock.list().find((l) => l.name === 'Milk')?.note).toBeNull();
  });

  it('updates several products by name or id, all or nothing', () => {
    const jam = svc.products.findOrCreate('Jam');
    svc.products.findOrCreate('Honey');
    svc.products.updateMany([
      { id: jam.id, openedShelfLifeDays: 30 },
      { product: 'honey', category: 'pantry', name: 'Wild honey' },
    ]);
    expect(svc.products.get(jam.id).openedShelfLifeDays).toBe(30);
    expect(svc.products.list().map((p) => p.name)).toContain('Wild honey');
    expect(() =>
      svc.products.updateMany([
        { product: 'Jam', brand: 'X' },
        { product: 'Nope', brand: 'Y' },
      ]),
    ).toThrow(/Item 2/);
    expect(svc.products.get(jam.id).brand).toBeNull();
  });

  it('finds a product id by id or name', () => {
    const p = svc.products.findOrCreate('Oats');
    expect(svc.products.idOf({ id: 5 })).toBe(5);
    expect(svc.products.idOf({ name: 'OATS' })).toBe(p.id);
    expect(() => svc.products.idOf({})).toThrow(/product id or a product name/);
    expect(() => svc.products.idOf({ name: 'Zzz' })).toThrow(/Zzz/);
  });
});
