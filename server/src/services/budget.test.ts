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

const pancakes = () =>
  svc.recipes.create({
    name: 'Pancakes',
    servings: 4,
    ingredients: [
      { name: 'Flour', quantity: 250, unit: 'g' },
      { name: 'Milk', quantity: 0.5, unit: 'l' },
      { name: 'Eggs', quantity: 3 },
    ],
  });

describe('budget', () => {
  it('learns product prices from purchases and estimates recipe and meal plan costs', () => {
    const recipe = pancakes();
    // Nothing is priced yet: the cost is a lower bound and says what is missing.
    expect(svc.budget.recipeCost({ id: recipe.id })).toMatchObject({ totalCents: 0, unpricedIngredients: ['Flour', 'Milk', 'Eggs'] });

    const expense = svc.budget.recordExpense({
      date: '2030-01-05',
      store: 'Market',
      items: [
        { name: 'Flour', quantity: 1, unit: 'kg', price: 2 },
        { name: 'Milk', quantity: 1, unit: 'l', price: 1.2 },
        { name: 'Eggs', quantity: 6, price: 2.4 },
      ],
      total: 5, // a discount applied at the till
      addToStock: true,
      location: 'pantry',
    });
    expect(expense).toMatchObject({ totalCents: 500, store: 'Market' });
    expect(expense.items.map((i) => [i.name, i.quantity, i.unit, i.priceCents])).toEqual([
      ['Flour', 1000, 'g', 200],
      ['Milk', 1000, 'ml', 120],
      ['Eggs', 6, 'piece', 240],
    ]);
    expect(svc.stock.list()).toHaveLength(3);

    // 250 g x 0.2 + 500 ml x 0.12 + 3 pieces x 40 = 230 cents
    expect(svc.budget.recipeCost({ id: recipe.id })).toMatchObject({ totalCents: 230, perServingCents: 58, unpricedIngredients: [] });
    expect(svc.budget.recipeCost({ id: recipe.id, servings: 8 })).toMatchObject({ totalCents: 460, perServingCents: 58 });

    svc.planner.add({ date: '2030-01-06', mealType: 'dinner', recipeId: recipe.id, servings: 8 });
    svc.planner.add({ date: '2030-01-07', mealType: 'lunch', title: 'Restaurant' });
    expect(svc.budget.planCost({ from: '2030-01-01', to: '2030-01-31' })).toMatchObject({ totalCents: 460, incompleteMeals: 1 });

    // Salt has no price: reported, and the total stays a lower bound.
    const salty = svc.recipes.create({
      name: 'Salty',
      servings: 1,
      ingredients: [
        { name: 'Flour', quantity: 100, unit: 'g' },
        { name: 'Salt', quantity: 5, unit: 'g' },
      ],
    });
    expect(svc.budget.recipeCost({ id: salty.id })).toMatchObject({ totalCents: 20, unpricedIngredients: ['Salt'] });

    // A price set by hand overrides the learned one.
    svc.budget.setProductPrice({ name: 'Flour', price: 3, quantity: 1, unit: 'kg' });
    expect(svc.budget.recipeCost({ id: recipe.id }).totalCents).toBe(255);
  });

  it('summarises spending and tracks the monthly budget', () => {
    const rice = svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg', location: 'pantry' });
    svc.products.update({ id: rice.productId, category: 'Dry goods' });
    svc.budget.recordExpense({
      date: '2030-01-05',
      store: 'Market',
      items: [
        { name: 'Rice', quantity: 1, unit: 'kg', price: 2 },
        { name: 'Soap', price: 3 },
      ],
    });
    svc.budget.recordExpense({ date: '2030-02-02', store: 'Online', total: 10 });
    expect(() => svc.budget.recordExpense({})).toThrow();

    const summary = svc.budget.summary({ from: '2030-01-01', to: '2030-12-31' });
    expect(summary).toMatchObject({ totalCents: 1500, expenseCount: 2, notItemisedCents: 1000 });
    expect(summary.byMonth).toEqual([
      { month: '2030-01', totalCents: 500 },
      { month: '2030-02', totalCents: 1000 },
    ]);
    expect(summary.byStore.map((s) => [s.store, s.totalCents])).toEqual([
      ['Online', 1000],
      ['Market', 500],
    ]);
    expect(summary.byCategory).toEqual([
      { category: null, totalCents: 300 },
      { category: 'Dry goods', totalCents: 200 },
    ]);
    expect(svc.budget.listExpenses({ from: '2030-02-01' })).toHaveLength(1);

    // Today's month: budget, spending and projection.
    expect(svc.budget.budgetStatus()).toMatchObject({ budgetCents: null, spentCents: 0, remainingCents: null });
    svc.budget.setBudget({ monthly: 300, currency: 'USD' });
    svc.budget.recordExpense({ total: 120.5 });
    expect(svc.budget.budgetStatus()).toMatchObject({ currency: 'USD', budgetCents: 30000, spentCents: 12050, remainingCents: 17950 });

    const first = svc.budget.listExpenses()[0];
    svc.budget.deleteExpense(first.id);
    expect(() => svc.budget.getExpense(first.id)).toThrow();
  });

  it('records the purchase when shopping is completed with prices', () => {
    svc.shopping.add({ name: 'Coffee', quantity: 2 });
    svc.shopping.add({ name: 'Tea' });
    const [coffee, tea] = ['Coffee', 'Tea'].map((n) => svc.shopping.list().find((i) => i.name === n)!);
    expect(svc.shopping.estimate()).toMatchObject({ totalCents: 0, pricedItems: 0, unpricedItems: 2 });

    svc.shopping.setChecked(coffee.id, false, 7); // priced while still to buy
    expect(svc.shopping.estimate()).toMatchObject({ totalCents: 700, pricedItems: 1, unpricedItems: 1 });
    svc.shopping.setChecked(coffee.id, true);
    svc.shopping.setChecked(tea.id, true);

    const result = svc.shopping.completePurchase('pantry', { store: 'Corner shop', total: 6.5, date: '2030-03-01' });
    expect(result).toMatchObject({ movedToStock: 2, expenseId: expect.any(Number) });
    expect(svc.budget.getExpense(result.expenseId!)).toMatchObject({ store: 'Corner shop', totalCents: 650, date: '2030-03-01' });
    // Coffee was bought for 7.00 for 2 pieces: 350 cents each, now used for estimates.
    expect(svc.products.list().find((p) => p.name === 'Coffee')).toMatchObject({ unitPrice: 350, priceUnit: 'piece' });
    // No prices and no total: nothing is recorded.
    svc.shopping.add({ name: 'Salt' });
    svc.shopping.setChecked(svc.shopping.list()[0].id, true);
    expect(svc.shopping.completePurchase('pantry').expenseId).toBeNull();
  });

  it('keeps budgets of different households apart', () => {
    const other = createServices(db, newHousehold());
    const mine = svc.budget.recordExpense({ total: 50, date: '2030-01-05' });
    expect(other.budget.listExpenses()).toHaveLength(0);
    expect(other.budget.summary({ from: '2030-01-01', to: '2030-12-31' }).totalCents).toBe(0);
    expect(() => other.budget.getExpense(mine.id)).toThrow();
  });
});
