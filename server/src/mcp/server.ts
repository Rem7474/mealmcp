import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, ZodError, type ZodRawShape } from 'zod';
import { today } from '../domain/dates.js';
import * as s from '../domain/schemas.js';
import type { Services } from '../services/index.js';

const INSTRUCTIONS = `MealMCP manages one household's kitchen: stock (what is at home), recipes, a meal plan and a shopping list.
Products are identified by name and created automatically the first time a name is used; reuse existing names (see list_stock / get_recipe) rather than inventing variants.
Quantities are stored in base units: g for mass, ml for volume, "piece" for countable items. kg, l, cl are converted automatically.
Typical flow: plan meals (plan_meal) -> generate_shopping_list for the planned period -> check items while shopping -> complete_shopping moves them into stock -> cook_planned_meal takes ingredients out of stock.`;

/** MCP adapter: exposes the same services as the REST API, as tools for AI clients. */
export function createMcpServer({ products, stock, recipes, planner, shopping }: Services) {
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
  tool('add_stock', 'Add a quantity of a product to the stock (after shopping, or to record what is at home).', s.stockAdd.shape, rw, (a) => stock.add(a));
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
  tool('update_product', 'Rename a product, set its category, or set/clear its low-stock threshold.', s.productUpdate.shape, rw, (a) => products.update(a));

  // --- Recipes -------------------------------------------------------------
  tool('list_recipes', 'List recipes (summary). Optionally search by recipe or ingredient name.', s.recipeList.shape, ro, (a) => recipes.list(a.search));
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
  tool('check_shopping_item', 'Check (bought) or uncheck a shopping list item.', s.shoppingCheck.shape, rw, (a) => shopping.setChecked(a.id, a.checked));
  tool('remove_shopping_item', 'Remove an item from the shopping list.', s.idParam.shape, del, (a) => shopping.remove(a.id));
  tool(
    'generate_shopping_list',
    'Rebuild the auto-generated part of the shopping list from the meal plan between two dates: ingredients needed by uncooked planned recipes minus current stock, plus restocking of products under their minimum. Manually added items are kept.',
    s.shoppingGenerate.shape,
    rw,
    (a) => shopping.generateFromPlan(a),
  );
  tool('complete_shopping', 'Shopping done: move every checked item into stock and remove it from the list.', s.shoppingComplete.shape, rw, (a) => shopping.completePurchase(a.location));

  return server;
}
