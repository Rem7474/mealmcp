import { today } from '../../domain/dates.js';
import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerPlanningTools({ planner, tool, ro, rw, del }: ToolContext) {
  // --- Meal plan -----------------------------------------------------------
  tool('list_meal_plan', 'List planned meals between two dates (inclusive).', s.planList.shape, ro, (a) => ({
    today: today(),
    meals: planner.list(a),
  }));
  tool('plan_meal', 'Plan a meal on a date: either a recipe (recipeId) or a free-text title.', s.planAdd.shape, rw, (a) => planner.add(a));
  tool('remove_planned_meal', 'Remove a planned meal. Use the id from list_meal_plan.', s.idParam.shape, del, (a) => planner.remove(a.id));
  tool(
    'cook_planned_meal',
    "Mark a planned meal as cooked and take its recipe's ingredients out of stock. Reports ingredients that were missing.",
    s.idParam.shape,
    rw,
    (a) => planner.cook(a.id),
  );
}
