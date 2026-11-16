import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { CATEGORIES } from '../domain/categories.js';
import { recipeCreate } from '../domain/schemas.js';
import { STARTER_AISLES, STARTER_LANGS, STARTER_PRODUCTS, STARTER_RECIPES, starterName } from '../domain/starter.js';
import { createServices, type Services } from './index.js';
import { starterRecipesAdd, starterStockAdd } from './starter.js';

let db: Db;
let svc: Services;
const newHousehold = () => db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, newHousehold());
});

const allKeys = Object.keys(STARTER_PRODUCTS) as (keyof typeof STARTER_PRODUCTS)[];

describe('starter data', () => {
  it.each(STARTER_LANGS)('has recipes that satisfy the recipe schema in %s, with no duplicate name', (lang) => {
    const names = STARTER_RECIPES.map((r) => r.name[lang].toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const r of STARTER_RECIPES) {
      const parsed = recipeCreate.safeParse({
        name: r.name[lang],
        servings: r.servings,
        steps: r.steps[lang].map((text) => ({ text })),
        ingredients: r.ingredients.map(([p, quantity]) => ({
          name: starterName(p, lang),
          ...(quantity === null ? { toTaste: true } : { quantity }),
        })),
      });
      expect(parsed.success, r.key).toBe(true);
    }
  });

  it('has the same steps in both languages and no duplicate product name', () => {
    for (const r of STARTER_RECIPES) expect(r.steps.fr.length, r.key).toBe(r.steps.en.length);
    for (const lang of STARTER_LANGS) {
      const names = allKeys.map((k) => starterName(k, lang).toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('puts every product in a known aisle that is offered', () => {
    for (const k of allKeys) {
      expect(CATEGORIES).toContain(STARTER_PRODUCTS[k].aisle);
      expect(STARTER_AISLES).toContain(STARTER_PRODUCTS[k].aisle);
    }
  });

  it('has unique recipe keys and ingredients that all exist', () => {
    expect(new Set(STARTER_RECIPES.map((r) => r.key)).size).toBe(STARTER_RECIPES.length);
    for (const r of STARTER_RECIPES) for (const [p] of r.ingredients) expect(STARTER_PRODUCTS[p], `${r.key}/${p}`).toBeDefined();
  });
});

describe('starter service', () => {
  it('lists aisles and recipes in the asked language, nothing marked at first', () => {
    const o = svc.starter.overview({ lang: 'fr' });
    expect(o.aisles.map((a) => a.aisle)).toEqual(['produce', 'dairy', 'meat_fish', 'bakery', 'pantry', 'frozen']);
    expect(o.aisles[0]?.products.map((p) => p.name)).toContain('Oignon');
    expect(o.recipes.map((r) => r.name)).toContain('Pâtes à la tomate');
    expect(o.aisles.flatMap((a) => a.products).every((p) => !p.added)).toBe(true);
    expect(o.recipes.every((r) => !r.imported)).toBe(true);
  });

  it('reading writes nothing', () => {
    svc.starter.overview({ lang: 'en' });
    expect(svc.products.list()).toEqual([]);
    expect(svc.recipes.list()).toEqual([]);
  });

  it('marks ticked products as plenty at home, in the right aisle and place', () => {
    expect(svc.starter.addStock({ lang: 'en', products: ['milk', 'pasta', 'peas'] })).toEqual({ added: 3, skipped: 0 });
    const lines = svc.stock.list();
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.approximate)).toBe(true);
    expect(lines.find((l) => l.name === 'Milk')?.location).toBe('fridge');
    expect(lines.find((l) => l.name === 'Frozen peas')?.location).toBe('freezer');
    expect(svc.products.findByName('Milk')?.category).toBe('dairy');
  });

  it('flags staples instead of stocking them, and does it once', () => {
    expect(svc.starter.addStock({ lang: 'en', products: ['oil', 'salt'] })).toEqual({ added: 2, skipped: 0 });
    expect(svc.stock.list()).toEqual([]);
    expect(svc.products.findByName('Olive oil')?.isStaple).toBe(true);
    expect(svc.starter.addStock({ lang: 'en', products: ['oil'] })).toEqual({ added: 0, skipped: 1 });
  });

  it('skips a product that already has stock and ignores repeated keys', () => {
    svc.stock.add({ name: 'Milk', quantity: 500, unit: 'ml', location: 'fridge' });
    expect(svc.starter.addStock({ lang: 'en', products: ['milk', 'egg', 'egg'] })).toEqual({ added: 1, skipped: 1 });
    expect(svc.stock.list().filter((l) => l.name === 'Milk')).toHaveLength(1);
    const marked = svc.starter.overview({ lang: 'en' }).aisles.flatMap((a) => a.products);
    expect(marked.find((p) => p.key === 'milk')?.added).toBe(true);
    expect(marked.find((p) => p.key === 'egg')?.added).toBe(true);
    expect(marked.find((p) => p.key === 'beef')?.added).toBe(false);
  });

  it('does not touch the flags of a product the household already shaped', () => {
    const p = svc.products.findOrCreate('Salt');
    svc.products.update({ id: p.id, staple: false, category: 'other' });
    svc.starter.addStock({ lang: 'en', products: ['salt'] });
    // The household's own product is kept as it is, then flagged because the user ticked it as always at home.
    expect(svc.products.findByName('Salt')?.category).toBe('other');
  });

  it('imports recipes with their steps, tags and ingredients, to taste kept apart', () => {
    const r = svc.starter.importRecipes({ lang: 'fr', recipes: ['tomato-pasta'] });
    expect(r).toMatchObject({ created: 1, skipped: 0 });
    const recipe = svc.recipes.get(r.recipes[0]?.id as number);
    expect(recipe.name).toBe('Pâtes à la tomate');
    expect(recipe.steps).toHaveLength(3);
    expect(recipe.tags).toContain('rapide');
    expect(recipe.ingredients.find((i) => i.name === 'Sel')?.toTaste).toBe(true);
    expect(recipe.ingredients.find((i) => i.name === 'Pâtes')?.quantity).toBe(200);
    expect(svc.products.findByName('Huile d’olive')?.isStaple).toBe(true);
    expect(svc.products.findByName('Pâtes')?.category).toBe('pantry');
  });

  it('imports again without duplicating, and imports all of them in one go', () => {
    svc.starter.importRecipes({ lang: 'en', recipes: ['pancakes'] });
    const r = svc.starter.importRecipes({ lang: 'en', recipes: STARTER_RECIPES.map((x) => x.key) });
    expect(r).toMatchObject({ created: STARTER_RECIPES.length - 1, skipped: 1 });
    expect(svc.recipes.list()).toHaveLength(STARTER_RECIPES.length);
    expect(svc.starter.overview({ lang: 'en' }).recipes.every((x) => x.imported)).toBe(true);
  });

  it('refuses an unknown key at the boundary', () => {
    expect(starterRecipesAdd.safeParse({ lang: 'en', recipes: ['nope'] }).success).toBe(false);
    expect(starterStockAdd.safeParse({ lang: 'en', products: ['nope'] }).success).toBe(false);
    expect(starterStockAdd.safeParse({ lang: 'de', products: ['milk'] }).success).toBe(false);
    expect(starterStockAdd.parse({ products: ['milk'] }).lang).toBe('en');
  });

  it('keeps two households apart', () => {
    const other = createServices(db, newHousehold());
    svc.starter.addStock({ lang: 'en', products: ['milk'] });
    svc.starter.importRecipes({ lang: 'en', recipes: ['pancakes'] });
    expect(other.stock.list()).toEqual([]);
    expect(other.recipes.list()).toEqual([]);
    expect(other.starter.overview({ lang: 'en' }).recipes.every((x) => !x.imported)).toBe(true);
    expect(other.starter.addStock({ lang: 'en', products: ['milk'] })).toEqual({ added: 1, skipped: 0 });
  });
});
