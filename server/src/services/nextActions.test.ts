import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { addDays, today } from '../domain/dates.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
const newHousehold = () => db.insert(households).values({ name: 'Test', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, newHousehold());
});

const ids = () => svc.nextActions.get().cards.map((c) => c.id);
const card = <T extends string>(id: T) => svc.nextActions.get().cards.find((c) => c.id === id);
const steps = () => {
  const c = card('getting-started');
  return c?.id === 'getting-started' ? Object.fromEntries(c.steps.map((s) => [s.id, s.done])) : null;
};

describe('next actions', () => {
  it('gives an empty household only the getting-started checklist, with nothing done', () => {
    const { cards, budget } = svc.nextActions.get();
    expect(cards).toEqual([
      {
        id: 'getting-started',
        target: 'stock',
        steps: [
          { id: 'stock', done: false },
          { id: 'recipes', done: false },
          { id: 'plan', done: false },
        ],
      },
    ]);
    expect(budget).toBeNull();
  });

  it('ticks the checklist from the data and points at the first step still to do', () => {
    svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    expect(steps()).toEqual({ stock: true, recipes: false, plan: false });
    expect(card('getting-started')).toMatchObject({ target: 'recipes' });

    const recipe = svc.recipes.create({ name: 'Rice bowl', servings: 2, ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
    expect(steps()).toEqual({ stock: true, recipes: true, plan: false });
    expect(card('getting-started')).toMatchObject({ target: 'planning' });

    svc.planner.add({ date: addDays(today(), 20), mealType: 'dinner', recipeId: recipe.id });
    // Everything is done: the checklist is gone.
    expect(steps()).toBeNull();
  });

  it('suggests using up what is about to expire, with the best recipe for it', () => {
    svc.stock.add({ name: 'Spinach', quantity: 200, unit: 'g', expiresOn: addDays(today(), 1) });
    svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg', expiresOn: addDays(today(), 300) });
    const gratin = svc.recipes.create({
      name: 'Spinach gratin',
      servings: 2,
      ingredients: [{ name: 'Spinach', quantity: 200, unit: 'g' }],
    });

    const expiring = card('expiring');
    expect(expiring).toMatchObject({
      id: 'expiring',
      total: 1,
      items: [{ name: 'Spinach', expiryState: 'soon' }],
      recipe: { id: gratin.id, name: 'Spinach gratin', canCook: true },
      target: `recipes/${gratin.id}`,
    });
  });

  it('still reports what expires when no recipe uses it, and sends the user to the stock', () => {
    svc.stock.add({ name: 'Yoghurt', quantity: 2, unit: 'piece', expiresOn: addDays(today(), 2) });
    svc.recipes.create({ name: 'Plain rice', servings: 2, ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
    expect(card('expiring')).toMatchObject({ recipe: null, target: 'stock', total: 1 });
  });

  it('sends what is past a use-by date to the bin, not to a recipe', () => {
    svc.stock.add({ name: 'Ham', quantity: 4, unit: 'piece', expiresOn: addDays(today(), -2), dateKind: 'use_by' });
    svc.recipes.create({ name: 'Ham toast', servings: 1, ingredients: [{ name: 'Ham', quantity: 1, unit: 'piece' }] });
    expect(card('discard')).toMatchObject({ total: 1, items: [{ name: 'Ham' }], target: 'stock' });
    expect(card('expiring')).toBeUndefined();
  });

  it('counts the open meal slots of the week', () => {
    svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    svc.recipes.create({ name: 'Rice bowl', servings: 2, ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
    svc.settings.set({ plannedMeals: { dinner: [0, 1, 2, 3, 4, 5, 6] } });
    // Planning something outside the window keeps the checklist's third step done without filling a slot.
    svc.planner.add({ date: addDays(today(), 20), mealType: 'dinner', title: 'Later' });
    expect(card('open-slots')).toMatchObject({ count: 7, first: { date: today(), mealType: 'dinner' }, target: 'planning' });
  });

  it('shows what is planned for today and whether it can be cooked', () => {
    svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    const can = svc.recipes.create({ name: 'Rice bowl', servings: 2, ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
    const cannot = svc.recipes.create({ name: 'Steak', servings: 2, ingredients: [{ name: 'Beef', quantity: 300, unit: 'g' }] });
    svc.planner.add({ date: today(), mealType: 'lunch', recipeId: can.id });
    const dinner = svc.planner.add({ date: today(), mealType: 'dinner', recipeId: cannot.id });

    expect(card('cook-today')).toMatchObject({
      meals: [
        { name: 'Rice bowl', mealType: 'lunch', canCook: true },
        { name: 'Steak', mealType: 'dinner', canCook: false },
      ],
    });
    // Once cooked, a meal leaves the card.
    svc.planner.cook(dinner.id);
    expect(card('cook-today')).toMatchObject({ meals: [{ name: 'Rice bowl' }] });
  });

  it('walks the shopping: generate the list, then buy, then put away', () => {
    svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    const stew = svc.recipes.create({ name: 'Stew', servings: 2, ingredients: [{ name: 'Beef', quantity: 400, unit: 'g' }] });
    svc.planner.add({ date: addDays(today(), 2), mealType: 'dinner', recipeId: stew.id });

    // A meal is planned, something is missing for it and the list is empty.
    expect(card('shopping-generate')).toMatchObject({ meals: 1, target: 'planning' });

    svc.shopping.generateFromPlan({ from: today(), to: addDays(today(), 6), includeLowStock: false });
    expect(card('shopping-generate')).toBeUndefined();
    expect(card('shopping-open')).toMatchObject({ count: 1, target: 'shopping' });

    const item = svc.shopping.list()[0];
    svc.shopping.setChecked(item.id, true);
    expect(card('shopping-open')).toBeUndefined();
    expect(card('shopping-put-away')).toMatchObject({ count: 1 });

    svc.shopping.completePurchase('fridge');
    // Bought and put away: nothing left to say about the list, and the meal can be cooked.
    expect(ids()).not.toContain('shopping-generate');
    expect(ids()).not.toContain('shopping-open');
    expect(ids()).not.toContain('shopping-put-away');
  });

  it('does not ask for a list when the planned meals can already be cooked', () => {
    svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    const bowl = svc.recipes.create({ name: 'Rice bowl', servings: 2, ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
    svc.planner.add({ date: addDays(today(), 1), mealType: 'dinner', recipeId: bowl.id });
    expect(ids()).not.toContain('shopping-generate');
  });

  it('flags products under their minimum', () => {
    svc.stock.add({ name: 'Rice', quantity: 1, unit: 'kg' });
    svc.recipes.create({ name: 'Rice bowl', servings: 2, ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
    svc.products.update({ id: svc.products.findByName('Rice')!.id, minStock: 2000 });
    expect(card('low-stock')).toMatchObject({ total: 1, items: [{ name: 'Rice' }], target: 'stock' });
  });

  it('keeps the most useful cards when there are too many, and lets the checklist trail', () => {
    svc.stock.add({ name: 'Spinach', quantity: 200, unit: 'g', expiresOn: addDays(today(), 1) });
    svc.stock.add({ name: 'Ham', quantity: 4, unit: 'piece', expiresOn: addDays(today(), -2), dateKind: 'use_by' });
    const gratin = svc.recipes.create({ name: 'Gratin', servings: 2, ingredients: [{ name: 'Spinach', quantity: 200, unit: 'g' }] });
    const steak = svc.recipes.create({ name: 'Steak', servings: 2, ingredients: [{ name: 'Beef', quantity: 300, unit: 'g' }] });
    svc.settings.set({ plannedMeals: { dinner: [0, 1, 2, 3, 4, 5, 6] } });
    svc.planner.add({ date: today(), mealType: 'lunch', recipeId: gratin.id });
    svc.planner.add({ date: addDays(today(), 1), mealType: 'lunch', recipeId: steak.id });
    svc.products.update({ id: svc.products.findByName('Spinach')!.id, minStock: 5000 });

    const found = ids();
    expect(found.length).toBeLessThanOrEqual(5);
    // Cooking tonight and using up what expires come before the rest.
    expect(found.slice(0, 3)).toEqual(['cook-today', 'expiring', 'discard']);
  });

  it('sums up the month against the budget', () => {
    expect(svc.nextActions.get().budget).toBeNull();
    svc.budget.setBudget({ monthly: 100 });
    expect(svc.nextActions.get().budget).toMatchObject({ budgetCents: 10000, spentCents: 0, state: 'ok' });

    svc.budget.recordExpense({ date: today(), store: 'Market', total: 85 });
    expect(svc.nextActions.get().budget).toMatchObject({ spentCents: 8500, state: 'close' });

    svc.budget.recordExpense({ date: today(), store: 'Market', total: 30 });
    expect(svc.nextActions.get().budget).toMatchObject({ spentCents: 11500, state: 'over' });
  });

  it('shows spending without a budget, and nothing when there is neither', () => {
    svc.budget.recordExpense({ date: today(), store: 'Market', total: 12 });
    expect(svc.nextActions.get().budget).toMatchObject({ budgetCents: null, spentCents: 1200, state: 'none' });
  });

  it('is a pure read: asking twice changes nothing and gives the same answer', () => {
    svc.stock.add({ name: 'Spinach', quantity: 200, unit: 'g', expiresOn: addDays(today(), 1) });
    svc.recipes.create({ name: 'Gratin', servings: 2, ingredients: [{ name: 'Spinach', quantity: 200, unit: 'g' }] });
    const before = [svc.stock.list(), svc.recipes.list(), svc.shopping.list(), svc.products.list()];
    const first = svc.nextActions.get();
    const second = svc.nextActions.get();
    expect(second).toEqual(first);
    expect([svc.stock.list(), svc.recipes.list(), svc.shopping.list(), svc.products.list()]).toEqual(before);
  });

  it('never sees another household', () => {
    const other = createServices(db, newHousehold());
    svc.stock.add({ name: 'Spinach', quantity: 200, unit: 'g', expiresOn: addDays(today(), 1) });
    svc.recipes.create({ name: 'Gratin', servings: 2, ingredients: [{ name: 'Spinach', quantity: 200, unit: 'g' }] });
    svc.budget.recordExpense({ date: today(), store: 'Market', total: 12 });
    svc.shopping.add({ name: 'Salt' });

    // The other household is still brand new.
    expect(other.nextActions.get().cards.map((c) => c.id)).toEqual(['getting-started']);
    expect(other.nextActions.get().budget).toBeNull();
    expect(JSON.stringify(other.nextActions.get())).not.toMatch(/Spinach|Gratin|Salt/);
  });
});
