import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { createServices, type Services } from './index.js';
import { closestHit, createNutritionService } from './nutrition.js';

let db: Db;
let svc: Services;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, db.insert(households).values({ name: 'Test', createdAt: Date.now() }).returning().get().id);
});

describe('nutrition module', () => {
  const offBody = {
    hits: [
      {
        code: '123456789012',
        product_name: 'Oat flakes',
        brands: ['Brand'],
        nutriments: { 'energy-kcal_100g': 370, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7, fiber_100g: 10 },
      },
      { code: '1', product_name: 'No energy', nutriments: {} },
    ],
  };
  const fakeFetch = (async (url: string) => {
    const body = String(url).includes('/api/v2/product/')
      ? { product: { code: '123456789012', product_name: 'Oat flakes', brands: 'Brand', nutriments: offBody.hits[0]!.nutriments } }
      : offBody;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const make = () => {
    const hid = db.select().from(households).get()!.id;
    return createNutritionService(db, hid, svc.settings, svc.products, svc.recipes, svc.planner, fakeFetch);
  };

  it('is off by default and refuses to do anything', async () => {
    await expect(make().search({ query: 'oats' })).rejects.toThrow(/module is off/);
    expect(() => make().recipe(1)).toThrow(/module is off/);
  });

  it('looks products up, keeps values on them and totals a recipe with its coverage', async () => {
    svc.settings.set({ nutrition: { enabled: true } });
    const n = make();
    const hits = await n.search({ query: 'oat flakes' });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ code: '123456789012', brands: 'Brand', per100: { kcal: 370, protein: 13 } });

    const recipe = svc.recipes.create({
      name: 'Porridge',
      servings: 2,
      ingredients: [
        { name: 'Oats', quantity: 100, unit: 'g' },
        { name: 'Milk', quantity: 200, unit: 'ml' },
        { name: 'Cinnamon', quantity: 1, unit: 'g', toTaste: true },
      ],
    });
    const oats = svc.products.list().find((p) => p.name === 'Oats')!;
    const milk = svc.products.list().find((p) => p.name === 'Milk')!;
    await n.setProduct({ id: oats.id, code: '123456789012' });
    expect(svc.products.get(oats.id).nutrition).toMatchObject({ source: 'openfoodfacts', code: '123456789012' });

    let r = n.recipe(recipe.id);
    expect(r.total.kcal).toBe(370);
    expect(r.perServing.kcal).toBe(185);
    expect(r.coverage).toMatchObject({ ingredients: 2, covered: 1, missing: ['Milk'], complete: false });

    await n.setProduct({ id: milk.id, per100: { kcal: 46, protein: 3.2 } });
    r = n.recipe(recipe.id);
    expect(r.total.kcal).toBe(462); // 200 ml counts as 200 g when the density is unknown
    expect(r.coverage.complete).toBe(true);

    svc.planner.add({ date: '2030-01-01', mealType: 'dinner', recipeId: recipe.id });
    svc.planner.add({ date: '2030-01-01', mealType: 'lunch', title: 'Out' });
    const week = n.plan({ from: '2030-01-01', to: '2030-01-07' });
    expect(week.freeTextMealsSkipped).toBe(1);
    expect(week.days[0]!.perPerson.kcal).toBe(231);

    await n.setProduct({ id: oats.id });
    expect(svc.products.get(oats.id).nutrition).toBeNull();
  });

  it('fills missing values with the closest match and never overwrites values typed by hand', async () => {
    svc.settings.set({ nutrition: { enabled: true } });
    const n = make();
    const recipe = svc.recipes.create({
      name: 'Porridge',
      servings: 2,
      ingredients: [
        { name: 'Oat flakes', quantity: 100, unit: 'g' },
        { name: 'Milk', quantity: 200, unit: 'ml' },
      ],
    });
    const milk = svc.products.list().find((p) => p.name === 'Milk')!;
    await n.setProduct({ id: milk.id, per100: { kcal: 46 } });
    expect(await n.autofillRecipe(recipe.id)).toBe(1);
    const oats = svc.products.list().find((p) => p.name === 'Oat flakes')!;
    expect(svc.products.get(oats.id).nutrition).toMatchObject({ source: 'openfoodfacts', auto: true, code: '123456789012' });
    expect(svc.products.get(milk.id).nutrition).toMatchObject({ source: 'manual' });
    expect(await n.autofillRecipe(recipe.id)).toBe(0);
  });

  it('picks the most generic hit that contains the words of the name', () => {
    const hit = (name: string, brands: string | null = null) => ({ code: name, name, brands, per100: { kcal: 1 } });
    expect(closestHit('Tomate', [hit('Pizza tomate mozzarella'), hit('Tomates', null), hit('Sauce tomate bio', 'X')])?.name).toBe(
      'Tomates',
    );
    expect(closestHit('Riz basmati', [hit('Chocolat noir')])).toBeNull();
  });
});
