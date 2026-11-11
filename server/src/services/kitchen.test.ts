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
    expect(svc.stock.list().map((i) => i.name).sort()).toEqual(['Beans', 'Rice']);

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

describe('staples, "to taste" and approximate quantities', () => {
  it('keep ingredients in recipes without buying, missing-checking or using them up', () => {
    const oil = svc.products.findOrCreate('Olive oil');
    svc.products.update({ id: oil.id, staple: true });
    svc.stock.add({ name: 'Pasta', approximate: true }); // plenty of pasta, amount unknown
    svc.stock.add({ name: 'Tomatoes', quantity: 2 });

    const recipe = svc.recipes.create({
      name: 'Pasta al pomodoro',
      servings: 2,
      ingredients: [
        { name: 'Pasta', quantity: 200, unit: 'g' },
        { name: 'Tomatoes', quantity: 4 },
        { name: 'Olive oil', quantity: 2, unit: 'tbsp' },
        { name: 'Pepper', toTaste: true },
      ],
    });
    // 2 tablespoons became 30 ml, "to taste" has no quantity.
    expect(recipe.ingredients.map((i) => [i.name, i.quantity, i.unit, i.toTaste])).toEqual([
      ['Pasta', 200, 'g', false],
      ['Tomatoes', 4, 'piece', false],
      ['Olive oil', 30, 'ml', false],
      ['Pepper', 0, 'piece', true],
    ]);

    const availability = svc.recipes.availability({ id: recipe.id });
    expect(availability.canCook).toBe(false);
    expect(availability.ingredients.filter((i) => i.missing > 0).map((i) => [i.name, i.missing])).toEqual([['Tomatoes', 2]]);
    expect(availability.ingredients.map((i) => [i.name, 'approximate' in i, 'staple' in i, 'toTaste' in i])).toEqual([
      ['Pasta', true, false, false],
      ['Tomatoes', false, false, false],
      ['Olive oil', false, true, false],
      ['Pepper', false, false, true],
    ]);

    // Shopping: only the tomatoes (2 missing); pasta, oil and pepper never show up.
    svc.planner.add({ date: '2030-01-07', mealType: 'dinner', recipeId: recipe.id });
    expect(svc.shopping.generateFromPlan({ from: '2030-01-01', to: '2030-01-31', includeLowStock: true }).map((i) => [i.name, i.quantity])).toEqual([['Tomatoes', 2]]);

    // Cooking uses the tomatoes but leaves the "plenty of pasta" marker (and the oil) alone.
    const { usage } = svc.planner.cook(svc.planner.list({ from: '2030-01-01', to: '2030-01-31' })[0].id);
    expect(usage.map((u) => u.name)).toEqual(['Pasta', 'Tomatoes', 'Olive oil']);
    expect(svc.stock.list().map((i) => [i.name, i.approximate])).toEqual([['Pasta', true]]);

    // Approximate stock and staples never raise low-stock alerts.
    svc.products.update({ id: svc.products.findByName('Pasta')!.id, minStock: 500 });
    svc.products.update({ id: oil.id, minStock: 500 });
    expect(svc.stock.lowStock()).toEqual([]);
  });

  it('does not price staples or "to taste" ingredients', () => {
    svc.products.update({ id: svc.products.findOrCreate('Salt').id, staple: true });
    svc.budget.setProductPrice({ name: 'Flour', price: 2, quantity: 1, unit: 'kg' });
    const recipe = svc.recipes.create({
      name: 'Bread',
      servings: 1,
      ingredients: [
        { name: 'Flour', quantity: 500, unit: 'g' },
        { name: 'Salt', quantity: 10, unit: 'g' },
        { name: 'Thyme', toTaste: true },
      ],
    });
    expect(svc.budget.recipeCost({ id: recipe.id })).toMatchObject({ totalCents: 100, unpricedIngredients: [] });
  });
});

describe('unit conversions per product', () => {
  it('compares pieces, grams and millilitres once the product has the conversion', () => {
    const potato = svc.products.findOrCreate('Sweet potato');
    svc.products.update({ id: potato.id, gramsPerPiece: 300 });
    svc.stock.add({ name: 'Sweet potato', quantity: 2 }); // 2 pieces = 600 g
    const recipe = svc.recipes.create({ name: 'Mash', servings: 2, ingredients: [{ name: 'Sweet potato', quantity: 450, unit: 'g' }] });
    expect(svc.recipes.availability({ id: recipe.id })).toMatchObject({ canCook: true });
    expect(svc.recipes.availability({ id: recipe.id, servings: 4 }).ingredients[0]).toMatchObject({ needed: 900, inStock: 600, missing: 300 });

    // Cooking takes 450 g out of the 2 pieces: 0.5 piece (150 g) is left.
    svc.planner.add({ date: '2030-01-07', mealType: 'dinner', recipeId: recipe.id });
    svc.planner.cook(svc.planner.list({ from: '2030-01-01', to: '2030-01-31' })[0].id);
    expect(svc.stock.list()).toMatchObject([{ name: 'Sweet potato', quantity: 0.5, unit: 'piece' }]);

    // Prices follow: a price per kg values a recipe written in pieces.
    svc.budget.setProductPrice({ name: 'Sweet potato', price: 3, quantity: 1, unit: 'kg' });
    const bake = svc.recipes.create({ name: 'Bake', servings: 1, ingredients: [{ name: 'Sweet potato', quantity: 2 }] });
    expect(svc.budget.recipeCost({ id: bake.id }).totalCents).toBe(180); // 2 x 300 g x 0.3 cents/g
  });

  it('uses density for ml <-> g and understands spoons and cups', () => {
    svc.products.update({ id: svc.products.findOrCreate('Honey').id, gramsPerMl: 1.4 });
    svc.stock.add({ name: 'Honey', quantity: 280, unit: 'g' });
    const recipe = svc.recipes.create({ name: 'Glaze', servings: 1, ingredients: [{ name: 'Honey', quantity: 2, unit: 'cups' }] }); // 480 ml = 672 g
    expect(svc.recipes.get(recipe.id).ingredients[0]).toMatchObject({ quantity: 480, unit: 'ml' });
    expect(svc.recipes.availability({ id: recipe.id }).ingredients[0]).toMatchObject({ inStock: 200, missing: 280 });
    // Without a conversion nothing is guessed: grams stock does not cover a volume.
    const other = svc.recipes.create({ name: 'Other', servings: 1, ingredients: [{ name: 'Syrup', quantity: 1, unit: 'tsp' }] });
    svc.stock.add({ name: 'Syrup', quantity: 500, unit: 'g' });
    expect(svc.recipes.availability({ id: other.id }).ingredients[0]).toMatchObject({ unit: 'ml', needed: 5, inStock: 0, missing: 5 });
  });

  it('rounds countable shopping needs up to whole pieces', () => {
    const recipe = svc.recipes.create({
      name: 'Salad',
      servings: 4,
      ingredients: [
        { name: 'Lemon', quantity: 0.25 },
        { name: 'Lettuce', quantity: 0.5 },
        { name: 'Olives', quantity: 120, unit: 'g' },
      ],
    });
    svc.planner.add({ date: '2030-01-07', mealType: 'lunch', recipeId: recipe.id, servings: 4 });
    const list = svc.shopping.generateFromPlan({ from: '2030-01-01', to: '2030-01-31', includeLowStock: false });
    expect(list.map((i) => [i.name, i.quantity, i.unit])).toEqual([
      ['Lemon', 1, 'piece'],
      ['Lettuce', 1, 'piece'],
      ['Olives', 120, 'g'],
    ]);
  });
});

describe('aliases', () => {
  it('resolve receipt wording to the right product', () => {
    svc.stock.add({ name: 'Pork chops', quantity: 600, unit: 'g' });
    svc.products.addAlias({ name: 'pork chops', alias: 'COTE FILET DE PORC' });
    expect(svc.products.list().find((p) => p.name === 'Pork chops')?.aliases).toEqual(['COTE FILET DE PORC']);

    const expense = svc.budget.recordExpense({ items: [{ name: 'cote filet de porc', quantity: 400, unit: 'g', price: 4.8 }], addToStock: true });
    expect(expense.items[0].name).toBe('Pork chops');
    expect(svc.products.list()).toHaveLength(1); // no duplicate product was created
    expect(svc.stock.list()).toMatchObject([{ name: 'Pork chops', quantity: 1000 }]);

    // An alias cannot steal another product's name.
    svc.stock.add({ name: 'Beef', quantity: 1 });
    expect(() => svc.products.addAlias({ name: 'Beef', alias: 'Pork chops' })).toThrow(/already refers/);
    svc.products.removeAlias('cote filet de porc');
    expect(svc.products.findByName('COTE FILET DE PORC')).toBeUndefined();
  });
});

describe('recipe details', () => {
  it('keeps cooking time, tags and structured steps, and filters by tag', () => {
    const recipe = svc.recipes.create({
      name: 'Crispy fries',
      prepMinutes: 10,
      cookMinutes: 20,
      tags: ['Air Fryer', 'quick', 'quick'],
      steps: [
        { text: 'Cut and season the potatoes' },
        { text: 'Cook until golden', appliance: 'air fryer', temperatureC: 200, durationMinutes: 20 },
      ],
      ingredients: [{ name: 'Potatoes', quantity: 600, unit: 'g' }],
    });
    expect(recipe).toMatchObject({ prepMinutes: 10, cookMinutes: 20, tags: ['air fryer', 'quick'] });
    expect(recipe.steps).toEqual([
      { position: 1, text: 'Cut and season the potatoes', durationMinutes: null, temperatureC: null, appliance: null },
      { position: 2, text: 'Cook until golden', durationMinutes: 20, temperatureC: 200, appliance: 'air fryer' },
    ]);
    svc.recipes.create({ name: 'Soup', ingredients: [] });
    expect(svc.recipes.list({ tag: 'air fryer' }).map((r) => r.name)).toEqual(['Crispy fries']);
    expect(svc.recipes.list({}).map((r) => r.tags.length)).toEqual([2, 0]);

    const updated = svc.recipes.update({ id: recipe.id, tags: ['dinner'], steps: [{ text: 'Eat' }] });
    expect(updated).toMatchObject({ tags: ['dinner'], cookMinutes: 20 });
    expect(updated.steps).toHaveLength(1);
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

describe('suggestions to use up expiring food', () => {
  it('ranks recipes by how much of what is about to expire they use', () => {
    const soon = addDays(today(), 2);
    svc.stock.add({ name: 'Eggs', quantity: 6, expiresOn: soon });
    svc.stock.add({ name: 'Sandwich bread', quantity: 8, expiresOn: soon });
    svc.stock.add({ name: 'Milk', quantity: 1, unit: 'l', expiresOn: addDays(today(), 30) });
    svc.stock.add({ name: 'Flour', quantity: 1, unit: 'kg' });

    svc.recipes.create({
      name: 'French toast',
      servings: 2,
      tags: ['quick'],
      ingredients: [
        { name: 'Eggs', quantity: 3 },
        { name: 'Sandwich bread', quantity: 4 },
        { name: 'Milk', quantity: 200, unit: 'ml' },
      ],
    });
    svc.recipes.create({ name: 'Omelette', servings: 2, ingredients: [{ name: 'Eggs', quantity: 4 }, { name: 'Cheese', quantity: 100, unit: 'g' }] });
    svc.recipes.create({ name: 'Pancakes', servings: 2, ingredients: [{ name: 'Flour', quantity: 200, unit: 'g' }, { name: 'Milk', quantity: 300, unit: 'ml' }] });

    const result = svc.recipes.suggest({ withinDays: 3 });
    expect(result.expiring.map((e) => e.name).sort()).toEqual(['Eggs', 'Sandwich bread']);
    // Pancakes use nothing that expires soon, so they are not suggested.
    expect(result.suggestions.map((s) => s.name)).toEqual(['French toast', 'Omelette']);
    expect(result.suggestions[0]).toMatchObject({ canCook: true, missing: [], usesExpiring: [{ name: 'Eggs' }, { name: 'Sandwich bread' }] });
    expect(result.suggestions[1]).toMatchObject({ canCook: false, missing: [{ name: 'Cheese', missing: 100 }] });

    // Naming products extends the targets; a tag narrows the recipes considered.
    expect(svc.recipes.suggest({ withinDays: 0, products: ['Flour'] }).suggestions.map((s) => s.name)).toEqual(['Pancakes']);
    expect(svc.recipes.suggest({ withinDays: 3, tag: 'quick' }).suggestions.map((s) => s.name)).toEqual(['French toast']);
  });
});

describe('equipment', () => {
  it('tracks what the household owns and what recipes need', () => {
    svc.equipment.add({ name: 'Air fryer', kind: 'appliance' });
    svc.equipment.add({ name: 'air fryer', kind: 'appliance' }); // same name: no duplicate
    expect(svc.equipment.list()).toHaveLength(1);

    const recipe = svc.recipes.create({
      name: 'Fries',
      ingredients: [{ name: 'Potatoes', quantity: 500, unit: 'g' }],
      equipment: ['Mandoline'],
      steps: [{ text: 'Cook', appliance: 'Air fryer', temperatureC: 200, durationMinutes: 20 }],
    });
    // Step appliances are attached too; the unknown mandoline is recorded as not owned.
    expect(recipe.equipment.map((e) => [e.name, e.owned])).toEqual([['Air fryer', true], ['Mandoline', false]]);
    expect(svc.recipes.availability({ id: recipe.id }).missingEquipment).toEqual(['Mandoline']);

    const mandoline = svc.equipment.list().find((e) => e.name === 'Mandoline')!;
    svc.equipment.update({ id: mandoline.id, owned: true });
    expect(svc.recipes.availability({ id: recipe.id }).missingEquipment).toEqual([]);

    // Replacing the list keeps step appliances.
    expect(svc.recipes.update({ id: recipe.id, equipment: [] }).equipment.map((e) => e.name)).toEqual(['Air fryer']);
    // Deleting an item removes it from recipes.
    svc.equipment.remove(svc.equipment.list().find((e) => e.name === 'Air fryer')!.id);
    expect(svc.recipes.get(recipe.id).equipment).toEqual([]);
  });
});

describe('recipe preferences', () => {
  it('stores a rating and a favorite flag, filters on them and ranks suggestions', () => {
    const a = svc.recipes.create({ name: 'Plain', ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] });
    const b = svc.recipes.create({ name: 'Loved', ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }], rating: 5, favorite: true });
    expect(svc.recipes.get(a.id)).toMatchObject({ rating: null, favorite: false });
    expect(svc.recipes.list({ favorite: true }).map((r) => r.name)).toEqual(['Loved']);
    expect(svc.recipes.list({ minRating: 4 }).map((r) => r.name)).toEqual(['Loved']);
    svc.stock.add({ name: 'Rice', quantity: 500, unit: 'g', expiresOn: today() });
    expect(svc.recipes.suggest({ withinDays: 5, limit: 5 }).suggestions.map((s) => s.name)).toEqual(['Loved', 'Plain']);
    expect(svc.recipes.update({ id: b.id, rating: null, favorite: false })).toMatchObject({ rating: null, favorite: false });
  });
});

describe('shopping list organisation', () => {
  it('says which meals a generated line is for and files products under an aisle', () => {
    const pasta = svc.recipes.create({ name: 'Pasta', ingredients: [{ name: 'Tomates', quantity: 2, unit: 'piece' }, { name: 'Savon', quantity: 1, unit: 'piece' }] });
    const salad = svc.recipes.create({ name: 'Salad', ingredients: [{ name: 'Tomates', quantity: 3, unit: 'piece' }] });
    const m1 = svc.planner.add({ date: '2030-01-02', mealType: 'dinner', recipeId: pasta.id });
    const m2 = svc.planner.add({ date: '2030-01-01', mealType: 'lunch', recipeId: salad.id });
    const list = svc.shopping.generateFromPlan({ from: '2030-01-01', to: '2030-01-31', includeLowStock: false });
    const tomatoes = list.find((i) => i.name === 'Tomates')!;
    expect(tomatoes.quantity).toBe(5);
    // Earliest meal first, and the line is shared in proportion to what each meal needs.
    expect(tomatoes.meals.map((m) => [m.id, m.title])).toEqual([[m2.id, 'Salad'], [m1.id, 'Pasta']]);
    expect(tomatoes.category).toBe('produce');
    expect(list.find((i) => i.name === 'Savon')!.category).toBe('household');
    // An explicit category wins over the guess.
    svc.products.update({ id: tomatoes.productId, category: 'pantry' });
    expect(svc.shopping.get(tomatoes.id).category).toBe('pantry');
    // Manual lines are not tied to a meal.
    expect(svc.shopping.add({ name: 'Bread', quantity: 1 }).meals).toEqual([]);
  });
});

describe('packs, opened jars and drained weight', () => {
  it('keeps the pack count and size, and opens a pack when part of it is used', () => {
    const line = svc.stock.add({ name: 'Coconut milk', packCount: 3, packSize: 200, unit: 'ml' });
    expect(line).toMatchObject({ quantity: 600, packSize: 200, packCount: 3, opened: false });
    // Another delivery with the same pack size and no date merges into the same line.
    expect(svc.stock.add({ name: 'Coconut milk', packCount: 1, packSize: 200, unit: 'ml' }).packCount).toBe(4);
    expect(() => svc.stock.add({ name: 'X', packCount: 2, unit: 'g' })).toThrow(/packSize/);

    svc.products.update({ id: line.productId, openedShelfLifeDays: 4 });
    // 250 ml: one whole pack goes, a second one is opened with 150 ml left.
    expect(svc.stock.consume({ name: 'Coconut milk', quantity: 250, unit: 'ml' })).toMatchObject({ consumed: 250, missing: 0 });
    const lines = svc.stock.list();
    expect(lines.filter((l) => !l.opened).map((l) => [l.quantity, l.packCount])).toEqual([[400, 2]]);
    const opened = lines.find((l) => l.opened)!;
    expect(opened).toMatchObject({ quantity: 150, packSize: 200, openedOn: today(), expiresOn: addDays(today(), 4) });
    // Opened packs are used before sealed ones, and show up in the alerts.
    expect(svc.stock.alerts().opened.map((l) => l.id)).toEqual([opened.id]);
    svc.stock.consume({ name: 'Coconut milk', quantity: 100, unit: 'ml' });
    expect(svc.stock.get(opened.id).quantity).toBe(50);

    // Opening by hand splits one pack off the sealed line and learns the shelf life.
    const jar = svc.stock.add({ name: 'Tomato sauce', packCount: 2, packSize: 400, unit: 'g' });
    const open = svc.stock.open({ id: jar.id, remaining: 300, shelfLifeDays: 3 });
    expect(open).toMatchObject({ quantity: 300, opened: true, expiresOn: addDays(today(), 3) });
    expect(svc.stock.get(jar.id)).toMatchObject({ quantity: 400, packCount: 1 });
    expect(svc.products.get(jar.productId).openedShelfLifeDays).toBe(3);
    // The printed date wins when it is sooner.
    const soon = svc.stock.add({ name: 'Cream', quantity: 200, unit: 'ml', expiresOn: addDays(today(), 1) });
    svc.products.update({ id: soon.productId, openedShelfLifeDays: 5 });
    expect(svc.stock.open({ id: soon.id }).expiresOn).toBe(addDays(today(), 1));
    // An already opened jar can be recorded directly.
    expect(svc.stock.add({ name: 'Jam', quantity: 150, unit: 'g', packSize: 370, opened: true })).toMatchObject({ opened: true, quantity: 150 });
  });

  it('compares drained grams in recipes with net grams on the label', () => {
    const beans = svc.stock.add({ name: 'Beans', packCount: 2, packSize: 200, unit: 'g' });
    svc.products.update({ id: beans.productId, drained: { netGrams: 200, drainedGrams: 125 } });
    const recipe = svc.recipes.create({ name: 'Chili', ingredients: [{ name: 'Beans', quantity: 250, unit: 'g' }] });
    // 400 g net = 250 g drained: just enough.
    expect(svc.recipes.availability({ id: recipe.id }).ingredients[0]).toMatchObject({ inStock: 250, missing: 0 });
    expect(svc.recipes.availability({ id: recipe.id, servings: 8 }).ingredients[0]!.missing).toBe(250);

    const meal = svc.planner.add({ date: '2030-01-01', mealType: 'dinner', recipeId: recipe.id, servings: 8 });
    // Needs 500 g drained (800 g net); 400 g net are in stock: the list asks for the 400 g net missing.
    const list = svc.shopping.generateFromPlan({ from: '2030-01-01', to: '2030-01-01', includeLowStock: false });
    expect(list.find((i) => i.name === 'Beans')!.quantity).toBe(400);
    svc.planner.remove(meal.id);

    svc.planner.add({ date: '2030-01-02', mealType: 'dinner', recipeId: recipe.id });
    const cooked = svc.planner.list({ from: '2030-01-02', to: '2030-01-02' })[0]!;
    svc.planner.cook(cooked.id);
    // 250 g drained used = 400 g net: the stock is empty and no empty line is left behind.
    expect(svc.stock.list()).toEqual([]);
    expect(() => svc.products.update({ id: beans.productId, drained: { netGrams: 100, drainedGrams: 150 } })).toThrow(/Drained/);
  });

  it('removes a line set to 0 and reports it', () => {
    const rice = svc.stock.add({ name: 'Rice', quantity: 500, unit: 'g' });
    expect(svc.stock.update({ id: rice.id, quantity: 0 })).toBeNull();
    expect(svc.stock.list()).toEqual([]);
  });

  it('removes a "plenty of it" line set to 0, and turns it exact when given a quantity', () => {
    const flour = svc.stock.add({ name: 'Flour', approximate: true });
    expect(svc.stock.update({ id: flour.id, quantity: 0 })).toBeNull();
    expect(svc.stock.list()).toEqual([]);

    const salt = svc.stock.add({ name: 'Salt', approximate: true });
    expect(svc.stock.update({ id: salt.id, quantity: 250 })).toMatchObject({ quantity: 250, approximate: false });
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

describe('diets and allergens', () => {
  it('flags recipes that break the household diet and skips them in suggestions', () => {
    svc.settings.set({ diet: { diets: ['vegetarian'], allergens: ['milk'], avoid: ['olives'] } });
    const stew = svc.recipes.create({ name: 'Stew', ingredients: [{ name: 'Boeuf', quantity: 300, unit: 'g' }] });
    const gratin = svc.recipes.create({ name: 'Gratin', ingredients: [{ name: 'Crème fraîche', quantity: 20, unit: 'cl' }, { name: 'Olives', quantity: 50, unit: 'g' }] });
    const salad = svc.recipes.create({ name: 'Salad', ingredients: [{ name: 'Lettuce', quantity: 1, unit: 'piece' }] });
    const reasons = (id: number) => svc.recipes.get(id).dietConflicts.flatMap((c) => c.reasons);
    expect(reasons(stew.id)).toContain('diet:vegetarian');
    expect(reasons(gratin.id)).toEqual(expect.arrayContaining(['allergen:milk', 'avoid:olives']));
    expect(svc.recipes.get(salad.id).dietConflicts).toEqual([]);
    expect(svc.planner.add({ date: '2030-01-01', mealType: 'dinner', recipeId: stew.id }).dietConflicts.length).toBeGreaterThan(0);
  });

  it('does not take coconut milk for dairy, and honours an explicit allergen list', () => {
    svc.settings.set({ diet: { allergens: ['milk'] } });
    const curry = svc.recipes.create({ name: 'Curry', ingredients: [{ name: 'Lait de coco', quantity: 40, unit: 'cl' }] });
    expect(svc.recipes.get(curry.id).dietConflicts).toEqual([]);
    const product = svc.products.list().find((p) => p.name === 'Lait de coco')!;
    svc.products.update({ id: product.id, allergens: ['milk'] });
    expect(svc.recipes.get(curry.id).dietConflicts.flatMap((c) => c.reasons)).toContain('allergen:milk');
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

describe('undoing an open', () => {
  it('seals a full pack again and merges it back, but not a used one', () => {
    svc.products.update({ id: svc.stock.add({ name: 'Cream', packCount: 2, packSize: 200, unit: 'ml' }).productId, openedShelfLifeDays: 3 });
    const line = svc.stock.list()[0]!;
    const opened = svc.stock.open({ id: line.id });
    expect(svc.stock.list()).toHaveLength(2);
    const back = svc.stock.unopen(opened.id);
    expect(back).toMatchObject({ quantity: 400, opened: false, packCount: 2, expiresOn: null });
    expect(svc.stock.list()).toHaveLength(1);
    const again = svc.stock.open({ id: line.id, remaining: 50 });
    expect(() => svc.stock.unopen(again.id)).toThrow(/already used/);
    expect(() => svc.stock.unopen(line.id)).toThrow(/not opened/);
  });
});

describe('waste tracking', () => {
  it('logs what is thrown away with its estimated cost', () => {
    svc.budget.setProductPrice({ name: 'Milk', quantity: 1, unit: 'l', price: 1.2 });
    const milk = svc.stock.add({ name: 'Milk', quantity: 1, unit: 'l' });
    const part = svc.stock.discard({ id: milk.id, quantity: 500, reason: 'expired' });
    expect(part).toMatchObject({ discarded: 500, costCents: 60, removed: false });
    expect(svc.stock.get(milk.id).quantity).toBe(500);
    svc.stock.discard({ id: milk.id, reason: 'spoiled' });
    expect(svc.stock.list()).toEqual([]);
    const bread = svc.stock.add({ name: 'Bread', quantity: 1, unit: 'piece' });
    svc.stock.discard({ id: bread.id, reason: 'expired' });
    const summary = svc.stock.wasteSummary({});
    expect(summary.itemsThrownAway).toBe(3);
    expect(summary.totalCostCents).toBe(120);
    expect(summary.unpricedItems).toBe(1);
    expect(summary.byProduct[0]).toMatchObject({ name: 'Milk', quantity: 1000 });
  });
});
