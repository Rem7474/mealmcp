import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerBudgetTools({ budget, shopping, tool, ro, rw, del }: ToolContext) {
  // --- Budget ----------------------------------------------------------------
  tool(
    'record_expense',
    'Record a purchase (e.g. from a receipt): optional receipt lines with their line totals, plus the amount actually paid. Lines with a quantity teach the product prices used for cost estimates; addToStock also puts them in the stock.',
    s.expenseRecord.shape,
    rw,
    (a) => budget.recordExpense(a),
  );
  tool('list_expenses', 'List recorded purchases (most recent first), optionally between two dates.', s.expenseList.shape, ro, (a) =>
    budget.listExpenses(a),
  );
  tool('get_expense', 'Get one purchase with its receipt lines.', s.idParam.shape, ro, (a) => budget.getExpense(a.id));
  tool('delete_expense', 'Delete a recorded purchase. Product prices learned from it are kept.', s.idParam.shape, del, (a) =>
    budget.deleteExpense(a.id),
  );
  tool(
    'get_spending_summary',
    'Spending between two dates: total, and breakdowns by shop, by month and by product category. Amounts are integers in cents.',
    s.spendingSummary.shape,
    ro,
    (a) => budget.summary(a),
  );
  tool(
    'get_budget_status',
    'This month: money spent, the monthly budget (if any), what is left, and a projection to the end of the month. Amounts are integers in cents.',
    {},
    ro,
    () => budget.budgetStatus(),
  );
  tool(
    'set_budget',
    'Set or clear the monthly grocery budget, and/or the household currency (ISO code such as EUR or USD).',
    s.budgetSet.shape,
    rw,
    (a) => budget.setBudget(a),
  );
  tool(
    'set_product_price',
    'Tell the app what a product costs, e.g. 2.49 for 1 kg of flour. Used for recipe, meal plan and shopping list cost estimates.',
    s.productPrice.shape,
    rw,
    (a) => budget.setProductPrice(a),
  );
  tool(
    'estimate_recipe_cost',
    'Estimated cost of a recipe (total and per serving, in cents) from the last known product prices. unpricedIngredients lists ingredients without a price, in which case the total is a lower bound.',
    s.recipeAvailability.shape,
    ro,
    (a) => budget.recipeCost(a),
  );
  tool('estimate_meal_plan_cost', 'Estimated cost, in cents, of the meals planned between two dates.', s.planList.shape, ro, (a) =>
    budget.planCost(a),
  );
  tool('estimate_shopping_list_cost', 'Estimated cost, in cents, of the items still to buy on the shopping list.', {}, ro, () =>
    shopping.estimate(),
  );
}
