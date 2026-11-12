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

describe('aliases', () => {
  it('resolve receipt wording to the right product', () => {
    svc.stock.add({ name: 'Pork chops', quantity: 600, unit: 'g' });
    svc.products.addAlias({ name: 'pork chops', alias: 'COTE FILET DE PORC' });
    expect(svc.products.list().find((p) => p.name === 'Pork chops')?.aliases).toEqual(['COTE FILET DE PORC']);

    const expense = svc.budget.recordExpense({
      items: [{ name: 'cote filet de porc', quantity: 400, unit: 'g', price: 4.8 }],
      addToStock: true,
    });
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
    svc.recipes.create({
      name: 'Omelette',
      servings: 2,
      ingredients: [
        { name: 'Eggs', quantity: 4 },
        { name: 'Cheese', quantity: 100, unit: 'g' },
      ],
    });
    svc.recipes.create({
      name: 'Pancakes',
      servings: 2,
      ingredients: [
        { name: 'Flour', quantity: 200, unit: 'g' },
        { name: 'Milk', quantity: 300, unit: 'ml' },
      ],
    });

    const result = svc.recipes.suggest({ withinDays: 3 });
    expect(result.expiring.map((e) => e.name).sort()).toEqual(['Eggs', 'Sandwich bread']);
    // Pancakes use nothing that expires soon, so they are not suggested.
    expect(result.suggestions.map((s) => s.name)).toEqual(['French toast', 'Omelette']);
    expect(result.suggestions[0]).toMatchObject({
      canCook: true,
      missing: [],
      usesExpiring: [{ name: 'Eggs' }, { name: 'Sandwich bread' }],
    });
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
    expect(recipe.equipment.map((e) => [e.name, e.owned])).toEqual([
      ['Air fryer', true],
      ['Mandoline', false],
    ]);
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

describe('diets and allergens', () => {
  it('flags recipes that break the household diet and skips them in suggestions', () => {
    svc.settings.set({ diet: { diets: ['vegetarian'], allergens: ['milk'], avoid: ['olives'] } });
    const stew = svc.recipes.create({ name: 'Stew', ingredients: [{ name: 'Boeuf', quantity: 300, unit: 'g' }] });
    const gratin = svc.recipes.create({
      name: 'Gratin',
      ingredients: [
        { name: 'Crème fraîche', quantity: 20, unit: 'cl' },
        { name: 'Olives', quantity: 50, unit: 'g' },
      ],
    });
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
