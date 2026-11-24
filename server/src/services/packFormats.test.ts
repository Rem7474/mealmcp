import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { addDays, today } from '../domain/dates.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id);
});

const plan = (name: string, quantity: number, unit: string, date = addDays(today(), 2)) => {
  const recipe = svc.recipes.create({
    name: `Dish ${name}`,
    servings: 1,
    ingredients: [{ name, quantity, unit }],
    steps: [{ text: 'Cook' }],
  });
  svc.planner.add({ date, mealType: 'dinner', recipeId: recipe.id, servings: 1 });
};
const range = () => ({ from: today(), to: addDays(today(), 14), includeLowStock: false });

describe('buying format', () => {
  it('learns the format from a purchase and rounds the list up to whole packs, keeping the surplus', () => {
    svc.purchase.apply({ lines: [{ name: 'Eggs', quantity: 6, unit: 'piece' }] });
    expect(svc.products.findByName('Eggs')).toMatchObject({ buyPackSize: 6, buyPackUnit: 'piece' });
    // Use up the stock, then plan 3 eggs.
    svc.stock.consume({ name: 'Eggs', quantity: 6 });
    plan('Eggs', 3, 'piece');

    const [line] = svc.shopping.generateFromPlan(range());
    expect(line).toMatchObject({ quantity: 6, unit: 'piece', needed: 3, surplus: 3, packSize: 6, packs: 1 });

    // Bought: the 3 left over cover the next meal, nothing is bought again.
    svc.shopping.setChecked(line.id, true);
    svc.shopping.completePurchase(undefined);
    expect(svc.stock.list().find((s) => s.name === 'Eggs')?.quantity).toBe(6);
    expect(svc.shopping.generateFromPlan(range())).toHaveLength(0);
  });

  it('rounds a weight need up to a pack of the same unit and converts across units', () => {
    svc.products.update({ id: svc.products.findOrCreate('Skyr', 'g').id, buyPack: { size: 450, unit: 'g' } });
    plan('Skyr', 500, 'g');
    const [line] = svc.shopping.generateFromPlan(range());
    expect(line).toMatchObject({ quantity: 900, unit: 'g', needed: 500, surplus: 400, packs: 2 });
  });

  it('does not round loose produce, and learns no format for it', () => {
    svc.purchase.apply({ lines: [{ name: 'Carottes', quantity: 5, unit: 'piece' }] });
    expect(svc.products.findByName('Carottes')?.buyPackSize).toBeNull();
    svc.products.update({ id: svc.products.findOrCreate('Citrons').id, buyPack: { size: 4, unit: 'piece' }, buyLoose: true });
    svc.stock.consume({ name: 'Carottes', quantity: 5 });
    plan('Citrons', 1, 'piece');
    expect(svc.shopping.generateFromPlan(range())[0]).toMatchObject({ quantity: 1, needed: null, surplus: 0, packSize: null });
  });

  it('leaves a product without a known format as it was', () => {
    plan('Flour', 300, 'g');
    expect(svc.shopping.generateFromPlan(range())[0]).toMatchObject({ quantity: 300, needed: null, surplus: 0 });
  });
});

describe('putting away what was bought', () => {
  it('sends each line to its own place, guessed from the aisle and then learned', () => {
    svc.shopping.add({ name: 'Lait', quantity: 1, unit: 'l' });
    svc.shopping.add({ name: 'Petits pois surgelés', quantity: 500, unit: 'g' });
    svc.shopping.add({ name: 'Riz', quantity: 1, unit: 'kg' });
    for (const i of svc.shopping.list()) svc.shopping.setChecked(i.id, true);
    expect(svc.shopping.completePurchase(undefined)).toMatchObject({ movedToStock: 3, location: null });
    const where = Object.fromEntries(svc.stock.list().map((s) => [s.name, s.location]));
    expect(where).toEqual({ Lait: 'fridge', 'Petits pois surgelés': 'freezer', Riz: 'pantry' });
  });

  it('keeps the place chosen on the line and remembers it for next time', () => {
    const line = svc.shopping.add({ name: 'Brioche', quantity: 1 });
    expect(line.storeIn).toBe('pantry');
    svc.shopping.setChecked(line.id, true, 3.2, 2, 'freezer');
    svc.shopping.completePurchase(undefined);
    expect(svc.stock.list()[0]).toMatchObject({ name: 'Brioche', quantity: 2, location: 'freezer' });
    expect(svc.shopping.add({ name: 'Brioche', quantity: 1 }).storeIn).toBe('freezer');
  });

  it('an explicit place for the whole trip still wins', () => {
    const line = svc.shopping.add({ name: 'Lait', quantity: 1, unit: 'l' });
    svc.shopping.setChecked(line.id, true);
    svc.shopping.completePurchase('pantry');
    expect(svc.stock.list()[0].location).toBe('pantry');
  });

  it('puts a typed purchase away in the product usual place, unless told otherwise', () => {
    svc.purchase.apply({ lines: [{ name: 'Yaourt', quantity: 4, unit: 'piece' }] });
    expect(svc.stock.list()[0].location).toBe('fridge');
    svc.purchase.apply({ lines: [{ name: 'Pain', quantity: 1, unit: 'piece' }], location: 'freezer' });
    expect(svc.products.findByName('Pain')?.defaultLocation).toBe('freezer');
  });
});

describe('waste risks', () => {
  it('warns when fresh food expires before the next planned meal that uses it, and only then', () => {
    svc.stock.add({ name: 'Eggs', quantity: 3, unit: 'piece', location: 'fridge', expiresOn: addDays(today(), 1) });
    svc.stock.add({ name: 'Cheese', quantity: 200, unit: 'g', location: 'fridge', expiresOn: addDays(today(), 10) });
    plan('Eggs', 3, 'piece', addDays(today(), 4));
    plan('Cheese', 100, 'g', addDays(today(), 4));
    const risks = svc.shopping.wasteRisks();
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ name: 'Eggs', nextUseOn: addDays(today(), 4), nextUseMeal: 'Dish Eggs' });
  });
});
