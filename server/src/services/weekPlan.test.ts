import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households, proposals } from '../db/schema.js';
import { addDays, today } from '../domain/dates.js';
import { weekPlanStart } from '../domain/schemas.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
const newHousehold = () => db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  db = createDb(':memory:');
  svc = createServices(db, newHousehold());
});

const monday = addDays(today(), 7);
const dinners = (n: number) =>
  weekPlanStart.parse({ meals: Array.from({ length: n }, (_, i) => ({ date: addDays(monday, i), mealType: 'dinner' })) });
const recipe = (name: string, ing = 'Rice', extra: object = {}) =>
  svc.recipes.create({ name, servings: 2, ingredients: [{ name: ing, quantity: 100, unit: 'g' }], ...extra });

describe('plan the week without a model', () => {
  it('spreads different recipes over the meals and writes nothing until applied', () => {
    for (const n of ['A', 'B', 'C']) recipe(n, `Ing ${n}`);
    const plan = svc.weekPlan.start(dinners(3), null);
    expect(plan.source).toBe('rules');
    expect(plan.slots.map((s) => s.recipe?.name).sort()).toEqual(['A', 'B', 'C']);
    expect(plan.slots.every((s) => s.status === 'proposed')).toBe(true);
    expect(svc.planner.list({ from: monday, to: addDays(monday, 6) })).toEqual([]);
  });

  it('leaves a slot empty when there are not enough recipes, and skips meals already planned', () => {
    const a = recipe('Only');
    svc.planner.add({ date: monday, mealType: 'dinner', recipeId: a.id });
    const plan = svc.weekPlan.start(dinners(3), null);
    expect(plan.alreadyPlanned).toEqual([{ date: monday, mealType: 'dinner' }]);
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots.map((s) => s.status).sort()).toEqual(['empty', 'proposed']);
  });

  it('prefers recipes that use up what expires', () => {
    svc.stock.add({ name: 'Spinach', quantity: 200, unit: 'g', expiresOn: addDays(today(), 1) });
    recipe('Spinach soup', 'Spinach');
    recipe('Spinach pie', 'Spinach');
    recipe('Plain rice', 'Rice');
    const plan = svc.weekPlan.start(dinners(2), null);
    const first = plan.slots[0].recipe!;
    expect(first.name).toMatch(/Spinach/);
    expect(first.reasons).toContain('usesExpiring');
    // The second meal no longer gets credit for the spinach already covered.
    expect(new Set(plan.slots.map((s) => s.recipe?.id)).size).toBe(2);
  });

  it('ranks down what was cooked recently and keeps recipes that break the diet out', () => {
    const recent = recipe('Recent', 'Beans');
    recipe('Fresh', 'Corn');
    recipe('Gratin', 'Cheese');
    svc.settings.set({ diet: { diets: [], allergens: ['milk'], avoid: [] } });
    svc.planner.add({ date: addDays(today(), -1), mealType: 'dinner', recipeId: recent.id });
    const plan = svc.weekPlan.start(dinners(1), null);
    expect(plan.slots[0].recipe?.name).toBe('Fresh');
    const all = svc.weekPlan.start(dinners(3), null);
    expect(all.slots.map((s) => s.recipe?.name)).not.toContain('Gratin');
  });

  it('honours the time ceiling', () => {
    recipe('Slow', 'Beans', { cookMinutes: 120 });
    recipe('Quick', 'Corn', { cookMinutes: 15 });
    expect(svc.weekPlan.start({ ...dinners(2), maxMinutes: 30 }, null).slots.map((s) => s.recipe?.name)).toEqual(['Quick', undefined]);
  });

  it('refusing moves to the next candidate, then leaves the slot empty', () => {
    for (const n of ['A', 'B']) recipe(n, `Ing ${n}`);
    const plan = svc.weekPlan.start(dinners(1), null);
    const key = plan.slots[0].key;
    const first = plan.slots[0].recipe!.name;
    const second = svc.weekPlan.refuse(plan.id, key).slots[0];
    expect(second.recipe?.name).not.toBe(first);
    expect(second.status).toBe('proposed');
    const none = svc.weekPlan.refuse(plan.id, key).slots[0];
    expect(none).toMatchObject({ recipe: null, status: 'refused' });
    expect(() => svc.weekPlan.accept(plan.id, key)).toThrow(/no recipe/);
  });

  it('applies only the accepted meals, once', () => {
    for (const n of ['A', 'B', 'C']) recipe(n, `Ing ${n}`);
    const plan = svc.weekPlan.start(dinners(3), null);
    svc.weekPlan.accept(plan.id, plan.slots[0].key);
    svc.weekPlan.refuse(plan.id, plan.slots[1].key);
    const result = svc.weekPlan.apply(plan.id);
    expect(result.planned).toHaveLength(1);
    expect(svc.planner.list({ from: monday, to: addDays(monday, 6) })).toHaveLength(1);
    expect(() => svc.weekPlan.apply(plan.id)).toThrow(/already applied/);
    expect(() => svc.weekPlan.accept(plan.id, plan.slots[0].key)).toThrow(/already applied/);
    expect(svc.weekPlan.current()).toBeNull();
  });

  it('accept all, then re-checks at apply: a recipe deleted or a slot filled meanwhile is skipped, not overwritten', () => {
    for (const n of ['A', 'B', 'C']) recipe(n, `Ing ${n}`);
    const plan = svc.weekPlan.start(dinners(3), null);
    svc.weekPlan.acceptAll(plan.id);
    svc.recipes.remove(plan.slots[0].recipe!.id as number);
    const other = recipe('Other', 'Corn');
    svc.planner.add({ date: plan.slots[1].date, mealType: 'dinner', recipeId: other.id });
    const result = svc.weekPlan.apply(plan.id);
    expect(result.skipped.map((s) => s.reason).sort()).toEqual(['recipeGone', 'slotTaken']);
    expect(result.planned).toHaveLength(1);
  });

  it('lets the household pick its own recipe for a slot', () => {
    recipe('A');
    const mine = recipe('Mine', 'Corn');
    const plan = svc.weekPlan.start(dinners(1), null);
    const out = svc.weekPlan.choose(plan.id, plan.slots[0].key, mine.id);
    expect(out.slots[0]).toMatchObject({ status: 'accepted', recipe: { name: 'Mine' } });
    expect(() => svc.weekPlan.choose(plan.id, plan.slots[0].key, 9999)).toThrow(/not found/);
    expect(() => svc.weekPlan.accept(plan.id, '2000-01-01|dinner')).toThrow(/not found/);
  });

  it('keeps one plan under review per household and expires old ones', () => {
    recipe('A');
    const one = svc.weekPlan.start(dinners(1), null);
    const two = svc.weekPlan.start(dinners(1), null);
    expect(() => svc.weekPlan.get(one.id)).toThrow(/not found/);
    expect(svc.weekPlan.current()?.id).toBe(two.id);
    db.update(proposals)
      .set({ expiresAt: Date.now() - 1 })
      .run();
    expect(() => svc.weekPlan.get(two.id)).toThrow(/not found/);
    expect(svc.weekPlan.current()).toBeNull();
  });

  it('never shows or touches another household’s plan', () => {
    recipe('A');
    const plan = svc.weekPlan.start(dinners(1), null);
    const other = createServices(db, newHousehold());
    expect(() => other.weekPlan.get(plan.id)).toThrow(/not found/);
    expect(() => other.weekPlan.apply(plan.id)).toThrow(/not found/);
    expect(() => other.weekPlan.refuse(plan.id, plan.slots[0].key)).toThrow(/not found/);
    expect(other.weekPlan.current()).toBeNull();
    other.weekPlan.start(dinners(1), null); // must not delete the first household's plan
    expect(svc.weekPlan.get(plan.id).id).toBe(plan.id);
  });

  it('validates the request', () => {
    expect(weekPlanStart.safeParse({ meals: [] }).success).toBe(false);
    expect(weekPlanStart.safeParse({ meals: [{ date: 'tomorrow', mealType: 'dinner' }] }).success).toBe(false);
    expect(weekPlanStart.safeParse({ meals: [{ date: monday, mealType: 'brunch' }] }).success).toBe(false);
  });
});
