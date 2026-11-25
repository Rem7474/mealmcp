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

describe('product sheet', () => {
  it('gathers settings, stock, prices, waste and recipes of one product in one read', () => {
    svc.budget.recordExpense({ date: '2030-01-05', store: 'Market', items: [{ name: 'Flour', quantity: 1, unit: 'kg', price: 2 }] });
    svc.budget.recordExpense({ date: '2030-02-05', store: 'Market', items: [{ name: 'Flour', quantity: 1, unit: 'kg', price: 4 }] });
    const flour = svc.products.findByName('Flour')!;
    svc.products.update({ id: flour.id, minStock: 500 });
    const a = svc.stock.add({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry', expiresOn: '2099-01-01' });
    svc.stock.add({ name: 'Flour', quantity: 250, unit: 'g', location: 'pantry', expiresOn: '2099-06-01' });
    svc.stock.add({ name: 'Sugar', quantity: 1, unit: 'kg' });
    svc.stock.discard({ id: a.id, quantity: 100, reason: 'spoiled' });
    svc.recipes.create({ name: 'Crêpes', ingredients: [{ name: 'Flour', quantity: 250, unit: 'g' }] });
    svc.recipes.create({ name: 'Bread', ingredients: [{ name: 'Flour', quantity: 500, unit: 'g' }] });
    svc.recipes.create({ name: 'Syrup', ingredients: [{ name: 'Sugar', quantity: 100, unit: 'g' }] });

    const sheet = svc.productSheet.get(flour.id);
    expect(sheet.product).toMatchObject({ id: flour.id, name: 'Flour', minStock: 500 });
    expect(sheet.stock).toMatchObject({ total: 1150, unit: 'g', plenty: false });
    expect(sheet.stock.lines.map((l) => l.name)).toEqual(['Flour', 'Flour']);
    expect(sheet.price).toMatchObject({ per: 'kg', latestCents: 400, count: 2, trend: 'up' });
    expect(sheet.waste).toMatchObject({ times: 1, recent: [{ quantity: 100, unit: 'g', reason: 'spoiled' }] });
    expect(sheet.waste.totalCostCents).toBe(sheet.waste.recent[0]!.costCents);
    expect(sheet.usedInRecipes.map((r) => r.name)).toEqual(['Bread', 'Crêpes']);
  });

  it('answers for a product with nothing recorded yet', () => {
    const p = svc.products.findOrCreate('Saffron', 'g');
    expect(svc.productSheet.get(p.id)).toMatchObject({
      stock: { total: 0, lines: [] },
      price: { count: 0, latestCents: null },
      waste: { times: 0, totalCostCents: 0, recent: [] },
      usedInRecipes: [],
    });
  });

  it('never shows another household its products, stock, waste or recipes', () => {
    svc.stock.add({ name: 'Flour', quantity: 1, unit: 'kg' });
    svc.recipes.create({ name: 'Bread', ingredients: [{ name: 'Flour', quantity: 500, unit: 'g' }] });
    const mine = svc.products.findByName('Flour')!;
    const other = createServices(db, newHousehold());
    expect(() => other.productSheet.get(mine.id)).toThrow(/not found/i);
    other.stock.add({ name: 'Flour', quantity: 200, unit: 'g' });
    const theirs = other.productSheet.get(other.products.findByName('Flour')!.id);
    expect(theirs.stock.total).toBe(200);
    expect(theirs.usedInRecipes).toEqual([]);
  });
});
