import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { purchaseApply } from '../domain/schemas.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
const newHousehold = () => db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, newHousehold());
});

describe('shopping done, from text', () => {
  it('matches lines to known products by name, alias, spelling and barcode, else proposes a new one', () => {
    const tomato = svc.products.findOrCreate('Tomates');
    svc.products.addAlias({ name: 'Tomates', alias: 'Tomato' });
    const milk = svc.products.findOrCreate('Lait', 'l');
    svc.products.attachBarcode(milk.id, '3017620422003');
    svc.products.findOrCreate('Crème fraîche');
    const { lines } = svc.purchase.parse('2 kg tomates\n1 tomato\n3017620422003 2\n1 creme fraiche 1.5€\nQuinoa 500g\n9999999999999');
    expect(lines.map((l) => [l.name, l.match])).toEqual([
      ['Tomates', 'name'],
      ['Tomates', 'name'],
      ['Lait', 'barcode'],
      ['Crème fraîche', 'close'],
      ['Quinoa', 'new'],
      ['', 'unknown'],
    ]);
    expect(lines[0]).toMatchObject({ productId: tomato.id, quantity: 2, unit: 'kg', include: true });
    expect(lines[2]).toMatchObject({ quantity: 2, unit: 'piece' });
    expect(lines[3].price).toBe(1.5);
    expect(lines[5]).toMatchObject({ include: false, barcode: '9999999999999' });
  });

  it('is a pure read', () => {
    svc.purchase.parse('2 kg quinoa');
    expect(svc.products.list()).toEqual([]);
    expect(svc.stock.list()).toEqual([]);
  });

  it('flags lines that are already on the shopping list', () => {
    svc.shopping.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    expect(svc.purchase.parse('rice\npasta').lines.map((l) => l.onList)).toEqual([true, false]);
  });

  it('refuses an absurd amount of lines', () => {
    expect(() => svc.purchase.parse(Array.from({ length: 101 }, (_, i) => `item ${i}`).join('\n'))).toThrow(/Too many/);
  });

  it('puts the lines in stock, takes them off the list and records the expense', () => {
    svc.shopping.add({ name: 'Rice', quantity: 1000, unit: 'g' });
    svc.shopping.add({ name: 'Milk', quantity: 3, unit: 'l' });
    svc.shopping.add({ name: 'Salt' });
    const result = svc.purchase.apply(
      purchaseApply.parse({
        lines: [
          { name: 'Rice', quantity: 400, unit: 'g', price: 1.2 },
          { name: 'Milk', quantity: 3, unit: 'l', price: 3 },
          { name: 'Salt', quantity: 1, unit: 'pack' },
        ],
        store: 'Shop',
        location: 'fridge',
      }),
    );
    expect(result).toMatchObject({ addedToStock: 3, removedFromList: 3, location: 'fridge' });
    expect(result.expenseId).not.toBeNull();
    expect(
      svc.stock
        .list()
        .map((s) => [s.name, s.quantity, s.location])
        .sort(),
    ).toEqual([
      ['Milk', 3000, 'fridge'],
      ['Rice', 400, 'fridge'],
      ['Salt', 1, 'fridge'],
    ]);
    // Rice was only partly bought: the rest stays to buy. Milk and salt are done.
    expect(svc.shopping.list().map((i) => [i.name, i.quantity])).toEqual([['Rice', 600]]);
    expect(svc.budget.getExpense(result.expenseId as number)).toMatchObject({ totalCents: 420, store: 'Shop' });
    // Line prices are kept on the stock lines so waste valuation and paidPer reflect what was paid.
    expect(svc.stock.list().find((i) => i.name === 'Milk')?.paidUnitPrice).toBeCloseTo(300 / 3000);
  });

  it('records no expense without a price or a total, and honours a total alone', () => {
    expect(svc.purchase.apply(purchaseApply.parse({ lines: [{ name: 'Oats', quantity: 1 }] })).expenseId).toBeNull();
    const withTotal = svc.purchase.apply(purchaseApply.parse({ lines: [{ name: 'Beans', quantity: 2 }], total: 5 }));
    expect(svc.budget.getExpense(withTotal.expenseId as number).totalCents).toBe(500);
  });

  it('is all or nothing', () => {
    svc.shopping.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    // The expense is recorded last: when it fails, the stock and the list must be as they were.
    vi.spyOn(svc.budget, 'recordExpense').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => svc.purchase.apply({ lines: [{ name: 'Rice', quantity: 1, unit: 'kg' }], total: 1, location: 'pantry' })).toThrow(
      /disk full/,
    );
    expect(svc.stock.list()).toEqual([]);
    expect(svc.shopping.list()).toHaveLength(1);
  });

  it('validates what is applied', () => {
    expect(purchaseApply.safeParse({ lines: [] }).success).toBe(false);
    expect(purchaseApply.safeParse({ lines: [{ name: 'x', quantity: 0 }] }).success).toBe(false);
    expect(purchaseApply.safeParse({ lines: [{ name: 'x', quantity: 1, price: -1 }] }).success).toBe(false);
  });

  it('never touches another household', () => {
    svc.shopping.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    const other = createServices(db, newHousehold());
    other.purchase.apply(purchaseApply.parse({ lines: [{ name: 'Rice', quantity: 1, unit: 'kg' }] }));
    expect(svc.shopping.list()).toHaveLength(1);
    expect(svc.stock.list()).toEqual([]);
    expect(other.purchase.parse('rice').lines[0].match).toBe('name');
    expect(svc.purchase.parse('rice').lines[0].match).toBe('name');
  });
});
