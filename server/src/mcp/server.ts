import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError, type ZodRawShape, z } from 'zod';
import type { Services } from '../services/index.js';
import { VERSION } from '../version.js';
import { registerBudgetTools } from './tools/budget.js';
import { registerBulkTools } from './tools/bulk.js';
import { registerCatalogTools } from './tools/catalog.js';
import type { ToolContext } from './tools/context.js';
import { registerInsightsTools } from './tools/insights.js';
import { registerNutritionTools } from './tools/nutrition.js';
import { registerPlanningTools } from './tools/planning.js';
import { registerProductsTools } from './tools/products.js';
import { registerRecipesTools } from './tools/recipes.js';
import { registerShoppingTools } from './tools/shopping.js';
import { registerStockTools } from './tools/stock.js';

const INSTRUCTIONS = `MealMCP manages one household's kitchen: stock (what is at home), recipes, a meal plan and a shopping list.
Products are identified by name and created automatically the first time a name is used; reuse existing names (see list_stock / get_recipe) rather than inventing variants.
Quantities are stored in base units: g for mass, ml for volume, "piece" for countable items. kg, l, cl, tablespoons, teaspoons and cups are converted automatically.
Products can carry conversions (update_product: gramsPerPiece, gramsPerMl) so grams, ml and pieces are comparable (1 sweet potato = 300 g), and a staple flag for things always at home (oil, salt, pepper): staples stay in recipes but are never bought, missing or used up. Use toTaste for "a pinch" ingredients and approximate=true for "plenty of it" stock.
Equipment: list_equipment shows the appliances and utensils the household owns; recipes can require some (create_recipe equipment, step appliance) and check_recipe_availability reports missingEquipment. Check it before suggesting a recipe.
Recipes carry a rating (1-5 stars) and a favorite flag set by the household (update_recipe); suggest_recipes ranks loved recipes higher, so respect them when proposing a menu.
Products can be filed under a store aisle (update_product category: produce, dairy, meat_fish, bakery, pantry, frozen, drinks, household, other); the shopping list can be shown by aisle or by meal, and generated lines say which planned meals they are for.
Packs and jars: record "2 x 500 g" as packCount/packSize, open a pack with open_stock_item (opened packs are used first and expire on their own clock), and read get_stock_alerts for what is opened. Products bought by net weight but cooked by drained weight (beans, tuna) carry a drained ratio (update_product drained): stock stays in label grams and recipe grams are read as drained.
Seasonality: get_seasonal_produce lists the fruits, vegetables and herbs in season where the household lives (settings country and hemisphere); shopping lines out of season carry in-season alternatives. Prefer seasonal produce when proposing meals.
Diet and allergies: the household settings hold diets, allergens and ingredients to avoid; recipes carry dietConflicts, suggest_recipes_to_use_up skips them and plan_meal warns. Matching is by ingredient name (a safety net, not a guarantee): set explicit allergens on a product with update_product when you know them.
Variety: get_meal_history shows what was cooked lately and how often per recipe; do not repeat recipes made recently. get_meal_context returns everything useful to propose a menu in a single call: start there.
Nutrition is an optional module (household setting nutrition.enabled, off by default): when on, tools search_nutrition and set_product_nutrition fill per-product values from Open Food Facts, and get_recipe_nutrition / get_meal_plan_nutrition report calories and macros with the share of ingredients covered. Say when totals are incomplete.
Waste: discard_stock records food thrown away (with its estimated cost) and get_waste_summary reports it.
Several items at once? Use the *_bulk tools instead of many single calls. One product in detail (settings, stock, prices, waste, recipes)? get_product reads it all at once.
Money: amounts you send are decimal numbers in the household currency (2.49); amounts you receive are integers in cents (249). Record purchases with record_expense so prices feed the cost estimates.
Typical flow: plan meals (plan_meal) -> generate_shopping_list for the planned period -> check items while shopping -> complete_shopping moves them into stock -> cook_planned_meal takes ingredients out of stock.`;

/** MCP adapter: exposes the same services as the REST API, as tools for AI clients. */
export function createMcpServer(services: Services, onChange?: () => void) {
  const server = new McpServer({ name: 'mealmcp', version: VERSION }, { instructions: INSTRUCTIONS });

  function tool<Shape extends ZodRawShape>(
    name: string,
    description: string,
    shape: Shape,
    opts: { readOnly?: boolean; destructive?: boolean },
    run: (args: z.infer<z.ZodObject<Shape>>) => unknown,
  ) {
    server.registerTool(
      name,
      {
        description,
        // Strict: a misspelled or unknown field is an error, not silently dropped (the caller would think it was saved).
        inputSchema: z.strictObject(shape),
        annotations: { readOnlyHint: !!opts.readOnly, destructiveHint: !!opts.destructive },
      },
      // Cast: the SDK's callback type depends on the schema shape in a way generics here can't express.
      (async (args: z.infer<z.ZodObject<Shape>>) => {
        try {
          const result = (await run(args)) ?? { ok: true };
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

  const ctx: ToolContext = { ...services, tool, ro: { readOnly: true }, rw: {}, del: { destructive: true } };
  registerStockTools(ctx);
  registerProductsTools(ctx);
  registerRecipesTools(ctx);
  registerPlanningTools(ctx);
  registerShoppingTools(ctx);
  registerBulkTools(ctx);
  registerInsightsTools(ctx);
  registerCatalogTools(ctx);
  registerNutritionTools(ctx);
  registerBudgetTools(ctx);

  return server;
}
