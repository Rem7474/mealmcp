import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerBudgetTools({ budget, prices, products, shopping, tool, ro, rw, del }: ToolContext) {
  // --- Budget ----------------------------------------------------------------
  tool(
    'record_expense',
    'Record a purchase (e.g. from a receipt): optional receipt lines with their line totals, plus the amount actually paid. Lines with a quantity teach the product prices used for cost estimates and feed the price history (get_price_history); lines without one are kept but listed in linesWithoutUnitPrice. addToStock also puts them in the stock.',
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
    'Tell the app what a product costs, e.g. 2.49 for 1 kg of flour (store: where you saw it). Used for recipe, meal plan and shopping list cost estimates; it is added to the price history.',
    s.productPrice.shape,
    rw,
    (a) => budget.setProductPrice(a),
  );
  tool(
    'get_price_history',
    'Price history of a product (its id from list_products, or its name): latest, average, lowest and highest price in cents per kg, per litre or per piece (see per), the trend (up, down or stable against the earlier prices), the price per shop and the last observations. Prices come from record_expense lines that have a quantity, and from set_product_price.',
    s.productRefParam.shape,
    ro,
    (a) => prices.history(products.idOf(a)),
  );
  tool('get_price_overview', 'One line per product that has a price history: latest, average, trend and cheapest store.', {}, ro, () =>
    prices.overview(),
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
