import type { ActionCard } from '../domain/actionCard.js';
import { addDays, today } from '../domain/dates.js';
import type { BudgetService } from './budget.js';
import type { PlannerService } from './planner.js';
import type { RecipeService } from './recipes.js';
import type { ShoppingService } from './shopping.js';
import type { StockService } from './stock.js';

export type { ActionCard } from '../domain/actionCard.js';

const MAX_CARDS = 5;
const SHOWN = 3;

/** Distinct names in first-seen order, the first few of them and how many there are in all. */
const distinct = <T extends { name: string }>(rows: T[]) => {
  const seen = new Map<string, T>();
  for (const row of rows) if (!seen.has(row.name)) seen.set(row.name, row);
  const all = [...seen.values()];
  return { items: all.slice(0, SHOWN), total: all.length };
};

/**
 * "What should we do now?": the few things worth doing, ranked, for a landing page or an assistant. A pure read of the
 * kitchen as it is today, with no model involved. A household that has set nothing up gets the getting-started
 * checklist instead; once it has begun, what is left of that checklist trails the practical cards.
 */
export function createNextActionsService(
  stock: StockService,
  recipes: RecipeService,
  planner: PlannerService,
  shopping: ShoppingService,
  budget: BudgetService,
) {
  return {
    get() {
      const now = today();
      const week = addDays(now, 6);

      const steps = [
        { id: 'stock' as const, done: stock.list().length > 0 },
        { id: 'recipes' as const, done: recipes.list().length > 0 },
        { id: 'plan' as const, done: planner.list({ from: addDays(now, -30), to: addDays(now, 30) }).length > 0 },
      ];
      const undone = steps.filter((s) => !s.done).length;
      // The checklist opens the screen of its first step that is still to do.
      const firstUndone = steps.find((s) => !s.done)?.id ?? 'stock';
      const started: ActionCard = { id: 'getting-started', target: firstUndone === 'plan' ? 'planning' : firstUndone, steps };
      if (undone === steps.length) return { today: now, cards: [started], budget: budgetSummary(budget) };

      const cards: ActionCard[] = [];
      const alerts = stock.alerts(3);

      // Planned for today and not cooked yet.
      const tonight = planner.list({ from: now, to: now }).filter((m) => !m.cooked);
      if (tonight.length)
        cards.push({
          id: 'cook-today',
          target: 'planning',
          meals: tonight.map((m) => ({
            id: m.id,
            name: m.recipeName ?? m.title ?? '',
            mealType: m.mealType,
            recipeId: m.recipeId,
            canCook: m.recipeId ? recipes.availability({ id: m.recipeId, servings: m.servings }).canCook : null,
          })),
        });

      // About to expire (or past a best-before date), with the best recipe that uses it up.
      const expiring = distinct(alerts.expiring.filter((i) => i.expiryState !== 'discard'));
      if (expiring.total) {
        const best = recipes.suggest({ withinDays: 3, limit: 1 }).suggestions[0];
        cards.push({
          id: 'expiring',
          target: best ? `recipes/${best.recipeId}` : 'stock',
          items: expiring.items.map((i) => ({ name: i.name, expiresOn: i.expiresOn, expiryState: i.expiryState })),
          total: expiring.total,
          recipe: best ? { id: best.recipeId, name: best.name, canCook: best.canCook } : null,
        });
      }

      // Past a use-by date: for the bin.
      const bin = distinct(alerts.toDiscard);
      if (bin.total) cards.push({ id: 'discard', target: 'stock', items: bin.items.map((i) => ({ name: i.name })), total: bin.total });

      const list = shopping.list();
      const checked = list.filter((i) => i.checked).length;
      const toBuy = list.length - checked;
      if (checked) cards.push({ id: 'shopping-put-away', target: 'shopping', count: checked });

      const slots = planner.slots({ from: now, to: week });
      if (slots.length)
        cards.push({
          id: 'open-slots',
          target: 'planning',
          count: slots.length,
          first: { date: slots[0].date, mealType: slots[0].mealType },
        });

      // Meals are planned, nothing is on the list, and something is missing for them: the list is the next step.
      if (list.length === 0) {
        const short = planner
          .list({ from: now, to: week })
          .filter((m) => !m.cooked && m.recipeId !== null && !recipes.availability({ id: m.recipeId, servings: m.servings }).canCook);
        if (short.length) cards.push({ id: 'shopping-generate', target: 'planning', meals: short.length });
      }
      if (toBuy) cards.push({ id: 'shopping-open', target: 'shopping', count: toBuy });

      const low = distinct(alerts.lowStock);
      if (low.total) cards.push({ id: 'low-stock', target: 'stock', items: low.items.map((i) => ({ name: i.name })), total: low.total });

      if (undone) cards.push(started);
      return { today: now, cards: cards.slice(0, MAX_CARDS), budget: budgetSummary(budget) };
    },
  };
}

/** This month against the budget, for the small tile on the landing page. Null while there is neither a budget nor any spending. */
function budgetSummary(budget: BudgetService) {
  const status = budget.budgetStatus();
  if (status.budgetCents === null && status.spentCents === 0) return null;
  const state =
    status.budgetCents === null
      ? ('none' as const)
      : status.spentCents > status.budgetCents
        ? ('over' as const)
        : status.spentCents >= status.budgetCents * 0.8 || status.projectedCents > status.budgetCents
          ? ('close' as const)
          : ('ok' as const);
  return { ...status, state };
}

export type NextActionsService = ReturnType<typeof createNextActionsService>;
