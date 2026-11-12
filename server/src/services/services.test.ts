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

describe('household isolation', () => {
  it('never exposes or modifies data of another household', () => {
    const other = createServices(db, newHousehold());
    const recipe = svc.recipes.create({ name: 'Secret', servings: 2, ingredients: [{ name: 'Flour', quantity: 100, unit: 'g' }] });
    const stock = svc.stock.add({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry' });
    const meal = svc.planner.add({ date: '2030-01-02', mealType: 'dinner', recipeId: recipe.id });
    const item = svc.shopping.add({ name: 'Sel' });

    expect(other.recipes.list()).toHaveLength(0);
    expect(other.stock.list()).toHaveLength(0);
    expect(other.products.list()).toHaveLength(0);
    expect(other.shopping.list()).toHaveLength(0);
    expect(other.planner.list({ from: '2030-01-01', to: '2030-01-31' })).toHaveLength(0);
    expect(() => other.recipes.get(recipe.id)).toThrow();
    expect(() => other.stock.remove(stock.id)).toThrow();
    expect(() => other.planner.cook(meal.id)).toThrow();
    expect(() => other.shopping.setChecked(item.id, true)).toThrow();
    expect(() => other.planner.add({ date: '2030-01-02', mealType: 'lunch', recipeId: recipe.id })).toThrow();
    // Same product names are independent per household.
    other.stock.add({ name: 'Flour', quantity: 5, unit: 'g', location: 'pantry' });
    expect(svc.stock.list()).toMatchObject([{ quantity: 1000 }]);
  });
});

describe('stock', () => {
  it('converts units and merges identical lines', () => {
    svc.stock.add({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry' });
    svc.stock.add({ name: 'flour', quantity: 500, unit: 'g', location: 'pantry' });
    const items = svc.stock.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Flour', quantity: 1500, unit: 'g' });
  });

  it('consumes soonest-expiring lines first and reports what is missing', () => {
    svc.stock.add({ name: 'Milk', quantity: 1, unit: 'l', location: 'fridge', expiresOn: '2030-01-10' });
    svc.stock.add({ name: 'Milk', quantity: 1, unit: 'l', location: 'fridge', expiresOn: '2030-01-05' });
    const result = svc.stock.consume({ name: 'Milk', quantity: 1.5, unit: 'l' });
    expect(result).toMatchObject({ consumed: 1500, missing: 0 });
    expect(svc.stock.list()).toMatchObject([{ quantity: 500, expiresOn: '2030-01-10' }]);
    expect(svc.stock.consume({ name: 'Milk', quantity: 1, unit: 'l' })).toMatchObject({ consumed: 500, missing: 500 });
    expect(svc.stock.list()).toHaveLength(0);
  });

  it('flags products under their minimum', () => {
    const item = svc.stock.add({ name: 'Eggs', quantity: 2, location: 'fridge' });
    svc.products.update({ id: item.productId, minStock: 6 });
    expect(svc.stock.lowStock()).toMatchObject([{ name: 'Eggs', current: 2, minStock: 6 }]);
  });
});

describe('plan -> shopping -> stock', () => {
  it('generates only what is missing, then moves purchases to stock and cooks', () => {
    const recipe = svc.recipes.create({
      name: 'Pancakes',
      servings: 4,
      ingredients: [
        { name: 'Flour', quantity: 250, unit: 'g' },
        { name: 'Milk', quantity: 0.5, unit: 'l' },
        { name: 'Eggs', quantity: 3 },
      ],
    });
    svc.stock.add({ name: 'Flour', quantity: 1, unit: 'kg', location: 'pantry' });
    svc.stock.add({ name: 'Eggs', quantity: 2, location: 'fridge' });
    svc.shopping.add({ name: 'Coffee' });
    const meal = svc.planner.add({ date: '2030-01-02', mealType: 'dinner', recipeId: recipe.id, servings: 8 });

    expect(svc.recipes.availability({ id: recipe.id, servings: 8 }).canCook).toBe(false);

    const range = { from: '2030-01-01', to: '2030-01-07', includeLowStock: true };
    const list = svc.shopping.generateFromPlan(range);
    expect(list.map((i) => [i.name, i.quantity, i.unit, i.source]).sort()).toEqual([
      ['Coffee', null, 'piece', 'manual'],
      ['Eggs', 4, 'piece', 'plan'],
      ['Milk', 1000, 'ml', 'plan'],
    ]);
    // Regenerating replaces generated items instead of piling them up.
    expect(svc.shopping.generateFromPlan(range)).toHaveLength(3);

    for (const item of svc.shopping.list()) svc.shopping.setChecked(item.id, true);
    expect(svc.shopping.completePurchase('fridge')).toMatchObject({ movedToStock: 3 });
    expect(svc.shopping.list()).toHaveLength(0);

    const { usage } = svc.planner.cook(meal.id);
    expect(usage.every((u) => u.missing === 0)).toBe(true);
    expect(
      svc.stock
        .list()
        .map((i) => [i.name, i.quantity])
        .sort(),
    ).toEqual([
      ['Coffee', 1],
      ['Flour', 500],
    ]);
    expect(() => svc.planner.cook(meal.id)).toThrow();
  });
});
