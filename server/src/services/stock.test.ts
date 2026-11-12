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
    expect(
      svc.shopping.generateFromPlan({ from: '2030-01-01', to: '2030-01-31', includeLowStock: true }).map((i) => [i.name, i.quantity]),
    ).toEqual([['Tomatoes', 2]]);

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
    expect(svc.recipes.availability({ id: recipe.id, servings: 4 }).ingredients[0]).toMatchObject({
      needed: 900,
      inStock: 600,
      missing: 300,
    });

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
    expect(svc.stock.add({ name: 'Jam', quantity: 150, unit: 'g', packSize: 370, opened: true })).toMatchObject({
      opened: true,
      quantity: 150,
    });
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

describe('undoing an open', () => {
  it('seals a full pack again and merges it back, but not a used one', () => {
    svc.products.update({
      id: svc.stock.add({ name: 'Cream', packCount: 2, packSize: 200, unit: 'ml' }).productId,
      openedShelfLifeDays: 3,
    });
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
