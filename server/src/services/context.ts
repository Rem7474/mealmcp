import { addDays, today } from '../domain/dates.js';
import type { BudgetService } from './budget.js';
import type { EquipmentService } from './equipment.js';
import type { PlannerService } from './planner.js';
import type { RecipeService } from './recipes.js';
import type { SeasonService } from './seasons.js';
import type { SettingsService } from './settings.js';
import type { StockService } from './stock.js';

/**
 * Everything an assistant needs to propose a menu, in one answer: the household's constraints, what is
 * in the kitchen and about to expire, what is in season, what was eaten lately, which recipes are loved,
 * which meals still need planning and what is left to spend.
 */
export function createContextService(
  settings: SettingsService,
  stock: StockService,
  recipes: RecipeService,
  planner: PlannerService,
  seasons: SeasonService,
  equipment: EquipmentService,
  budget: BudgetService,
) {
  return {
    get({ days = 14, historyDays = 30 }: { days?: number; historyDays?: number } = {}) {
      const now = today();
      const end = addDays(now, days);
      const all = recipes.list();
      const history = planner.history({ days: historyDays });
      const slim = (r: (typeof all)[number]) => ({
        id: r.id,
        name: r.name,
        rating: r.rating,
        favorite: r.favorite,
        lastMadeOn: r.lastMadeOn,
        timesMade: r.timesMade,
        dietConflicts: r.dietConflicts,
      });
      const alerts = stock.alerts(5);
      return {
        today: now,
        household: settings.get(),
        season: seasons.list(),
        stock: { expiringSoon: alerts.expiring, opened: alerts.opened, lowStock: alerts.lowStock },
        openSlots: planner.slots({ from: now, to: end }),
        upcomingMeals: planner.list({ from: now, to: end }),
        recentMeals: history.meals,
        recentRecipeFrequency: history.recipes,
        favorites: all.filter((r) => r.favorite || (r.rating ?? 0) >= 4).map(slim),
        neverMade: all.filter((r) => r.timesMade === 0).map(slim),
        recipeCount: all.length,
        equipmentOwned: equipment
          .list()
          .filter((e) => e.owned)
          .map((e) => e.name),
        budget: budget.budgetStatus(),
      };
    },
  };
}

export type ContextService = ReturnType<typeof createContextService>;
