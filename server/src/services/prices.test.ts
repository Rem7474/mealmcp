import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households, priceObservations } from '../db/schema.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
const newHousehold = () => db.insert(households).values({ name: 'Test', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, newHousehold());
});

const buy = (date: string, store: string, price: number, quantity = 1, unit = 'kg', name = 'Flour') =>
  svc.budget.recordExpense({ date, store, items: [{ name, quantity, unit, price }] });

describe('price history', () => {
  it('keeps one observation per receipt line with a quantity and reads them per kg', () => {
    buy('2030-01-05', 'Market', 2);
    buy('2030-02-05', 'Leclerc', 2.4, 2); // 1.2 per kg
    buy('2030-03-05', 'Market', 2.2);
    const id = svc.products.list()[0]!.id;
    const h = svc.prices.history(id);
    expect(h).toMatchObject({ per: 'kg', count: 3, latestCents: 220, minCents: 120, maxCents: 220, trend: 'up' });
    expect(h.averageCents).toBeCloseTo(180);
    expect(h.byStore.map((s) => [s.store, s.latestCents, s.count])).toEqual([
      ['Leclerc', 120, 1],
      ['Market', 220, 2],
    ]);
    expect(h.observations.map((o) => o.date)).toEqual(['2030-03-05', '2030-02-05', '2030-01-05']);
  });

  it('follows the most recent observation, even when an older receipt is entered later', () => {
    buy('2030-03-05', 'Market', 3);
    buy('2030-01-05', 'Market', 1);
    const product = svc.products.list()[0]!;
    expect(product.unitPrice).toBeCloseTo(0.3);
    expect(product.pricePer?.main).toMatchObject({ per: 'kg' });
    expect(product.pricePer?.main.cents).toBeCloseTo(300);
  });

  it('keeps lines without a quantity but flags them, and records no observation', () => {
    const e = svc.budget.recordExpense({ items: [{ name: 'Bread', price: 1.2 }] });
    expect(e.items).toHaveLength(1);
    expect(e.linesWithoutUnitPrice).toEqual(['Bread']);
    expect(svc.prices.history(e.items[0]!.productId!)).toMatchObject({ count: 0, latestCents: null, per: null, trend: null });
  });

  it('adds manual prices with their shop, and keeps what a deleted expense taught', () => {
    const e = buy('2030-01-05', 'Market', 2);
    svc.budget.setProductPrice({ name: 'Flour', price: 2.5, quantity: 1, unit: 'kg', store: 'Bio', date: '2030-02-01' });
    svc.budget.deleteExpense(e.id);
    const h = svc.prices.history(svc.products.list()[0]!.id);
    expect(h.count).toBe(2);
    expect(h.byStore.map((s) => s.store).sort()).toEqual(['Bio', 'Market']);
    expect(h.observations.map((o) => o.source).sort()).toEqual(['manual', 'receipt']);
  });

  it('reads an observation in another unit through the product conversion', () => {
    svc.products.update({ id: svc.products.findOrCreate('Eggs', 'piece').id, gramsPerPiece: 50 });
    svc.budget.recordExpense({ date: '2030-01-01', items: [{ name: 'Eggs', quantity: 6, price: 2.4 }] }); // 40 c/piece
    svc.budget.recordExpense({ date: '2030-02-01', items: [{ name: 'Eggs', quantity: 600, unit: 'g', price: 2.4 }] }); // 0.4 c/g
    const h = svc.prices.history(svc.products.list()[0]!.id);
    expect(h).toMatchObject({ per: 'kg', count: 2, latestCents: 400, minCents: 400, maxCents: 800, trend: 'down' });
    expect(h.alternative?.per).toBe('piece');
    expect(h.alternative?.cents).toBeCloseTo(20); // 0.4 c/g x 50 g
  });

  it('never shows another household its prices', () => {
    buy('2030-01-05', 'Market', 2);
    const other = createServices(db, newHousehold());
    const mine = svc.products.list()[0]!.id;
    expect(() => other.prices.history(mine)).toThrow();
    expect(db.select().from(priceObservations).all()).toHaveLength(1);
    expect(other.products.list()).toEqual([]);
  });
});
