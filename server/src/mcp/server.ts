import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, ZodError, type ZodRawShape } from 'zod';
import { today } from '../domain/dates.js';
import * as s from '../domain/schemas.js';
import type { Services } from '../services/index.js';

const INSTRUCTIONS = `MealMCP manages one household's kitchen: stock (what is at home), recipes, a meal plan and a shopping list.
Products are identified by name and created automatically the first time a name is used; reuse existing names (see list_stock / get_recipe) rather than inventing variants.
Quantities are stored in base units: g for mass, ml for volume, "piece" for countable items. kg, l, cl, tablespoons, teaspoons and cups are converted automatically.
Products can carry conversions (update_product: gramsPerPiece, gramsPerMl) so grams, ml and pieces are comparable (1 sweet potato = 300 g), and a staple flag for things always at home (oil, salt, pepper): staples stay in recipes but are never bought, missing or used up. Use toTaste for "a pinch" ingredients and approximate=true for "plenty of it" stock.
Equipment: list_equipment shows the appliances and utensils the household owns; recipes can require some (create_recipe equipment, step appliance) and check_recipe_availability reports missingEquipment. Check it before suggesting a recipe.
Recipes carry a rating (1-5 stars) and a favorite flag set by the household (update_recipe); suggest_recipes ranks loved recipes higher, so respect them when proposing a menu.
Products can be filed under a store aisle (update_product category: produce, dairy, meat_fish, bakery, pantry, frozen, drinks, household, other); the shopping list can be shown by aisle or by meal, and generated lines say which planned meals they are for.
Several items at once? Use the *_bulk tools instead of many single calls.
Money: amounts you send are decimal numbers in the household currency (2.49); amounts you receive are integers in cents (249). Record purchases with record_expense so prices feed the cost estimates.
Typical flow: plan meals (plan_meal) -> generate_shopping_list for the planned period -> check items while shopping -> complete_shopping moves them into stock -> cook_planned_meal takes ingredients out of stock.`;

/** MCP adapter: exposes the same services as the REST API, as tools for AI clients. */
export function createMcpServer({ settings, equipment, products, stock, recipes, planner, budget, shopping }: Services, onChange?: () => void) {
  const server = new McpServer({ name: 'mealmcp', version: '0.1.0' }, { instructions: INSTRUCTIONS });

  function tool<Shape extends ZodRawShape>(
    name: string,
    description: string,
    shape: Shape,
    opts: { readOnly?: boolean; destructive?: boolean },
    run: (args: z.objectOutputType<Shape, z.ZodTypeAny>) => unknown,
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: shape,
        annotations: { readOnlyHint: !!opts.readOnly, destructiveHint: !!opts.destructive },
      },
      // Cast: the SDK's callback type depends on the schema shape in a way generics here can't express.
      (async (args: z.objectOutputType<Shape, z.ZodTypeAny>) => {
        try {
          const result = run(args) ?? { ok: true };
          // Writes wake the open dashboards of the household so they refresh by themselves.
          if (!opts.readOnly) onChange?.();
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const message =
            err instanceof ZodError ? err.issues.map((i) => i.message).join('; ') : err instanceof Error ? err.message : String(err);
          return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
        }
      }) as never,
    );
  }

  const ro = { readOnly: true };
  const rw = {};
  const del = { destructive: true };

  // --- Stock ---------------------------------------------------------------
  tool('list_stock', 'List what is currently in stock, soonest expiry first. Optionally filter by location or by upcoming expiry.', s.stockList.shape, ro, (a) => stock.list(a));
  tool('add_stock', 'Add a quantity of a product to the stock (after shopping, or to record what is at home). Use approximate=true (no quantity) for "plenty of it".', s.stockAdd.shape, rw, (a) => stock.add(a));
  tool('update_stock_item', 'Correct a stock line: quantity, location or expiry date. Use the id from list_stock.', s.stockUpdate.shape, rw, (a) => stock.update(a) ?? { removed: true });
  tool('consume_stock', 'Take a quantity of a product out of stock (used or thrown away), soonest-expiring first. Reports what could not be covered.', s.stockConsume.shape, rw, (a) => stock.consume(a));
  tool('remove_stock_item', 'Delete a stock line entirely. Use the id from list_stock.', s.idParam.shape, del, (a) => stock.remove(a.id));
  tool(
    'get_stock_alerts',
    `Products below their minimum threshold, and items that are expired or expire soon. Today is ${today()} at server start; dates are YYYY-MM-DD.`,
    { expiringWithinDays: z.number().int().nonnegative().default(3) },
    ro,
    (a) => ({ today: today(), ...stock.alerts(a.expiringWithinDays) }),
  );

  // --- Products ------------------------------------------------------------
  tool('list_products', 'List all known products with their category, default unit and minimum stock threshold.', {}, ro, () => products.list());
  tool('update_product', 'Rename a product, set its category (aisle: produce, dairy, meat_fish, bakery, pantry, frozen, drinks, household, other), low-stock threshold, staple flag, or conversions (gramsPerPiece, gramsPerMl).', s.productUpdate.shape, rw, (a) => products.update(a));

  // --- Recipes -------------------------------------------------------------
  tool('list_recipes', 'List recipes (summary). Optionally search by recipe or ingredient name.', s.recipeList.shape, ro, (a) => recipes.list(a));
  tool('get_recipe', 'Get a recipe with its ingredients and instructions.', s.idParam.shape, ro, (a) => recipes.get(a.id));
  tool('create_recipe', 'Create a recipe with its ingredient list.', s.recipeCreate.shape, rw, (a) => recipes.create(a));
  tool('update_recipe', 'Update a recipe. Passing ingredients replaces the whole ingredient list.', s.recipeUpdate.shape, rw, (a) => recipes.update(a));
  tool('delete_recipe', 'Delete a recipe and its planned occurrences.', s.idParam.shape, del, (a) => recipes.remove(a.id));
  tool('check_recipe_availability', 'Compare what a recipe needs with the current stock: per ingredient needed / in stock / missing.', s.recipeAvailability.shape, ro, (a) => recipes.availability(a));

  // --- Meal plan -----------------------------------------------------------
  tool('list_meal_plan', 'List planned meals between two dates (inclusive).', s.planList.shape, ro, (a) => ({ today: today(), meals: planner.list(a) }));
  tool('plan_meal', 'Plan a meal on a date: either a recipe (recipeId) or a free-text title.', s.planAdd.shape, rw, (a) => planner.add(a));
  tool('remove_planned_meal', 'Remove a planned meal. Use the id from list_meal_plan.', s.idParam.shape, del, (a) => planner.remove(a.id));
  tool('cook_planned_meal', "Mark a planned meal as cooked and take its recipe's ingredients out of stock. Reports ingredients that were missing.", s.idParam.shape, rw, (a) => planner.cook(a.id));

  // --- Shopping list -------------------------------------------------------
  tool('list_shopping_list', 'List the shopping list (unchecked items first).', {}, ro, () => shopping.list());
  tool('add_shopping_item', 'Add an item to the shopping list; merges with the same unchecked item if present.', s.shoppingAdd.shape, rw, (a) => shopping.add(a));
  tool('check_shopping_item', 'Check (bought) or uncheck a shopping list item, optionally with what the line cost.', s.shoppingCheck.shape, rw, (a) => shopping.setChecked(a.id, a.checked, a.price));
  tool('remove_shopping_item', 'Remove an item from the shopping list.', s.idParam.shape, del, (a) => shopping.remove(a.id));
  tool(
    'generate_shopping_list',
    'Rebuild the auto-generated part of the shopping list from the meal plan between two dates: ingredients needed by uncooked planned recipes minus current stock, plus restocking of products under their minimum. Manually added items are kept.',
    s.shoppingGenerate.shape,
    rw,
    (a) => shopping.generateFromPlan(a),
  );
  tool('complete_shopping', 'Shopping done: move every checked item into stock and remove it from the list. If prices were entered on the lines (or a total is given) the purchase is also recorded as an expense.', s.shoppingComplete.shape, rw, (a) => shopping.completePurchase(a.location, { store: a.store, total: a.total, date: a.date }));

  // --- Bulk, aliases, settings, planning help ----------------------------------------
  tool('add_stock_bulk', 'Add many stock lines in one call (all or nothing). Same fields as add_stock, in an items array.', s.stockAddMany.shape, rw, (a) => stock.addMany(a.items));
  tool('create_recipes_bulk', 'Create many recipes in one call (all or nothing). Same fields as create_recipe, in a recipes array.', s.recipeCreateMany.shape, rw, (a) => recipes.createMany(a.recipes));
  tool('plan_meals_bulk', 'Plan many meals in one call (all or nothing). Same fields as plan_meal, in a meals array.', s.planAddMany.shape, rw, (a) => planner.addMany(a.meals));
  tool('add_shopping_items_bulk', 'Add many shopping list items in one call (all or nothing). Same fields as add_shopping_item, in an items array.', s.shoppingAddMany.shape, rw, (a) => shopping.addMany(a.items));
  tool('add_product_alias', 'Teach another name for a product (e.g. the wording on a receipt), so receipts, recipes and lists using it resolve to the same product.', s.aliasAdd.shape, rw, (a) => products.addAlias(a));
  tool('remove_product_alias', 'Remove an alias of a product.', s.aliasRemove.shape, del, (a) => products.removeAlias(a.alias));
  tool('list_equipment', 'Appliances (air fryer, oven...) and utensils the household owns, plus ones recipes need that it does not have (owned=false).', {}, ro, () => equipment.list());
  tool('add_equipment', 'Record an appliance or utensil the household has (owned=true, default) or a missing one. Idempotent by name.', s.equipmentAdd.shape, rw, (a) => equipment.add(a));
  tool('update_equipment', 'Rename an item, change its kind, or mark it owned/not owned.', s.equipmentUpdate.shape, rw, (a) => equipment.update(a));
  tool('remove_equipment', 'Delete an appliance or utensil (also removes it from recipes that required it).', s.idParam.shape, del, (a) => equipment.remove(a.id));
  tool('get_household_settings', 'Household preferences: default servings and which meals are planned on which weekdays.', {}, ro, () => settings.get());
  tool('set_household_settings', 'Set the default number of servings and/or the weekly meal pattern (e.g. dinners from Sunday to Thursday). plannedMeals replaces the whole pattern when given.', s.settingsSet.shape, rw, (a) => settings.set(a));
  tool('list_planning_slots', 'Meals the household expects to plan (from its settings) that have nothing planned yet between two dates: the empty slots to fill with plan_meal / plan_meals_bulk.', s.planSlots.shape, ro, (a) => ({ today: today(), slots: planner.slots(a) }));
  tool(
    'suggest_recipes_to_use_up',
    'Recipes that use up what is about to expire (or the products you name), best first: which expiring items each uses, whether it can be cooked now, and what is missing.',
    s.suggestRecipes.shape,
    ro,
    (a) => recipes.suggest(a),
  );

  // --- Budget ----------------------------------------------------------------
  tool(
    'record_expense',
    'Record a purchase (e.g. from a receipt): optional receipt lines with their line totals, plus the amount actually paid. Lines with a quantity teach the product prices used for cost estimates; addToStock also puts them in the stock.',
    s.expenseRecord.shape,
    rw,
    (a) => budget.recordExpense(a),
  );
  tool('list_expenses', 'List recorded purchases (most recent first), optionally between two dates.', s.expenseList.shape, ro, (a) => budget.listExpenses(a));
  tool('get_expense', 'Get one purchase with its receipt lines.', s.idParam.shape, ro, (a) => budget.getExpense(a.id));
  tool('delete_expense', 'Delete a recorded purchase. Product prices learned from it are kept.', s.idParam.shape, del, (a) => budget.deleteExpense(a.id));
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
  tool('set_budget', 'Set or clear the monthly grocery budget, and/or the household currency (ISO code such as EUR or USD).', s.budgetSet.shape, rw, (a) => budget.setBudget(a));
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
  tool('estimate_meal_plan_cost', 'Estimated cost, in cents, of the meals planned between two dates.', s.planList.shape, ro, (a) => budget.planCost(a));
  tool('estimate_shopping_list_cost', 'Estimated cost, in cents, of the items still to buy on the shopping list.', {}, ro, () => shopping.estimate());

  return server;
}
