import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerInsightsTools({ stock, planner, seasons, context, tool, ro, del }: ToolContext) {
  // --- Seasons, history, context, waste ----------------------------------------
  tool(
    'get_seasonal_produce',
    'Fruits, vegetables and herbs in season where the household lives (country and hemisphere settings), for a month (default: this month), with what is ending this month and what starts next month.',
    s.seasonList.shape,
    ro,
    (a) => seasons.list(a),
  );
  tool(
    'get_meal_history',
    'Meals planned in the last days (default 60) with whether they were cooked, and per recipe how often and when it was last made. Use it to avoid repeating recipes.',
    s.mealHistory.shape,
    ro,
    (a) => planner.history(a),
  );
  tool(
    'get_meal_context',
    'Everything needed to propose a menu in one call: today, household settings (diet, allergens, servings, country), in-season produce, stock about to expire and opened packs, open planning slots, upcoming and recent meals, favorite and never-made recipes, owned equipment and the budget status.',
    s.mealContext.shape,
    ro,
    (a) => context.get(a),
  );
  tool(
    'discard_stock',
    'Throw food away: removes it from a stock line (all of it unless quantity is given) and logs it as waste with its estimated cost.',
    s.stockDiscard.shape,
    del,
    (a) => stock.discard(a),
  );
  tool(
    'get_waste_summary',
    'Food thrown away between two dates (default: last 30 days): total value in cents, by product, by reason and by month.',
    s.wasteSummary.shape,
    ro,
    (a) => stock.wasteSummary(a),
  );
}
