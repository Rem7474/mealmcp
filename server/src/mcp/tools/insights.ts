import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerInsightsTools({ stock, planner, seasons, context, nextActions, tool, ro, del }: ToolContext) {
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
    'get_next_actions',
    'What the household should do now, ranked: cook what is planned for today, use up what is about to expire (with the best recipe for it), throw away what is past its use-by date, put away checked shopping, plan the open slots of the week, start or work through the shopping list, restock. Also the getting-started checklist for a household that has set little up, and this month against the budget. Facts only, no text; a good first call when the user asks what to do.',
    {},
    ro,
    () => nextActions.get(),
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
