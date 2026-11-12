import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { addDays, today } from '../domain/dates.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, db.insert(households).values({ name: 'Test', createdAt: Date.now() }).returning().get().id);
});

describe('bulk operations', () => {
  it('add everything or nothing', () => {
    const added = svc.stock.addMany([
      { name: 'Rice', quantity: 1, unit: 'kg' },
      { name: 'Beans', quantity: 400, unit: 'g' },
    ]);
    expect(added).toHaveLength(2);
    // The second line is invalid (no quantity, not approximate): the first must be rolled back too.
    expect(() => svc.stock.addMany([{ name: 'Pasta', quantity: 500, unit: 'g' }, { name: 'Oats' }])).toThrow(/quantity/);
    expect(
      svc.stock
        .list()
        .map((i) => i.name)
        .sort(),
    ).toEqual(['Beans', 'Rice']);

    const recipes = svc.recipes.createMany([
      { name: 'A', ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] },
      { name: 'B', ingredients: [{ name: 'Beans', quantity: 100, unit: 'g' }] },
    ]);
    expect(recipes.map((r) => r.name)).toEqual(['A', 'B']);
    const meals = svc.planner.addMany([
      { date: '2030-01-07', mealType: 'dinner', recipeId: recipes[0].id },
      { date: '2030-01-08', mealType: 'dinner', recipeId: recipes[1].id },
    ]);
    expect(meals).toHaveLength(2);
    expect(svc.shopping.addMany([{ name: 'Salt' }, { name: 'Pepper' }])).toHaveLength(2);
  });
});

describe('household settings and planning slots', () => {
  it('lists the meals still to plan and scales new meals to the usual number of eaters', () => {
    expect(svc.settings.get()).toEqual({});
    svc.settings.set({ defaultServings: 1, plannedMeals: { dinner: [0, 1, 2, 3, 4] } }); // dinners Sunday to Thursday
    expect(svc.settings.get()).toMatchObject({ defaultServings: 1 });

    // 2030-01-06 is a Sunday.
    const week = { from: '2030-01-06', to: '2030-01-12' };
    expect(svc.planner.slots(week).map((s) => [s.date, s.mealType])).toEqual([
      ['2030-01-06', 'dinner'],
      ['2030-01-07', 'dinner'],
      ['2030-01-08', 'dinner'],
      ['2030-01-09', 'dinner'],
      ['2030-01-10', 'dinner'],
    ]);

    const recipe = svc.recipes.create({ name: 'Stew', servings: 4, ingredients: [{ name: 'Beef', quantity: 800, unit: 'g' }] });
    const meal = svc.planner.add({ date: '2030-01-07', mealType: 'dinner', recipeId: recipe.id });
    expect(meal.servings).toBe(1); // not the recipe's 4
    expect(svc.planner.slots(week)).toHaveLength(4);
    expect(svc.planner.add({ date: '2030-01-08', mealType: 'dinner', recipeId: recipe.id, servings: 3 }).servings).toBe(3);

    // Merging keeps the other settings; the meal pattern is replaced as a whole.
    expect(svc.settings.set({ plannedMeals: { lunch: [1] } })).toEqual({ defaultServings: 1, plannedMeals: { lunch: [1] } });
  });
});

describe('shopping list organisation', () => {
  it('says which meals a generated line is for and files products under an aisle', () => {
    const pasta = svc.recipes.create({
      name: 'Pasta',
      ingredients: [
        { name: 'Tomates', quantity: 2, unit: 'piece' },
        { name: 'Savon', quantity: 1, unit: 'piece' },
      ],
    });
    const salad = svc.recipes.create({ name: 'Salad', ingredients: [{ name: 'Tomates', quantity: 3, unit: 'piece' }] });
    const m1 = svc.planner.add({ date: '2030-01-02', mealType: 'dinner', recipeId: pasta.id });
    const m2 = svc.planner.add({ date: '2030-01-01', mealType: 'lunch', recipeId: salad.id });
    const list = svc.shopping.generateFromPlan({ from: '2030-01-01', to: '2030-01-31', includeLowStock: false });
    const tomatoes = list.find((i) => i.name === 'Tomates')!;
    expect(tomatoes.quantity).toBe(5);
    // Earliest meal first, and the line is shared in proportion to what each meal needs.
    expect(tomatoes.meals.map((m) => [m.id, m.title])).toEqual([
      [m2.id, 'Salad'],
      [m1.id, 'Pasta'],
    ]);
    expect(tomatoes.category).toBe('produce');
    expect(list.find((i) => i.name === 'Savon')!.category).toBe('household');
    // An explicit category wins over the guess.
    svc.products.update({ id: tomatoes.productId, category: 'pantry' });
    expect(svc.shopping.get(tomatoes.id).category).toBe('pantry');
    // Manual lines are not tied to a meal.
    expect(svc.shopping.add({ name: 'Bread', quantity: 1 }).meals).toEqual([]);
  });
});

describe('seasons', () => {
  it('lists produce by month and shifts it for the southern hemisphere', () => {
    const july = svc.seasons.list({ month: 7 });
    const january = svc.seasons.list({ month: 1 });
    const names = (l: typeof july) => l.inSeason.map((p) => p.en);
    expect(names(july)).toContain('Tomato');
    expect(names(january)).not.toContain('Tomato');
    svc.settings.set({ hemisphere: 'south' });
    expect(names(svc.seasons.list({ month: 1 }))).toContain('Tomato');
  });

  it('flags out-of-season produce on the shopping list with alternatives', () => {
    svc.settings.set({ country: 'FR' });
    const month = Number(today().slice(5, 7));
    const tomato = svc.seasons.statusOf('Tomates', month);
    const line = svc.shopping.add({ name: 'Tomates' });
    expect(line.season).toBe(tomato?.inSeason ? 'in' : 'out');
    expect(svc.shopping.add({ name: 'Lessive' }).season).toBeNull();
  });
});

describe('meal history', () => {
  it('reports what was made recently and how often', () => {
    const soup = svc.recipes.create({ name: 'Soup', ingredients: [{ name: 'Leek', quantity: 2, unit: 'piece' }] });
    svc.planner.add({ date: addDays(today(), -3), mealType: 'dinner', recipeId: soup.id });
    svc.planner.add({ date: addDays(today(), -10), mealType: 'dinner', recipeId: soup.id });
    svc.planner.add({ date: addDays(today(), 2), mealType: 'dinner', recipeId: soup.id });
    const history = svc.planner.history({ days: 30 });
    expect(history.meals).toHaveLength(2);
    expect(history.recipes[0]).toMatchObject({ name: 'Soup', times: 2, lastMadeOn: addDays(today(), -3) });
    expect(svc.recipes.list().find((r) => r.id === soup.id)).toMatchObject({ lastMadeOn: addDays(today(), -3), timesMade: 2 });
    expect(svc.context.get().recentRecipeFrequency).toHaveLength(1);
  });
});
