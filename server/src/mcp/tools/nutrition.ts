import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerNutritionTools({ nutrition, tool, ro, rw }: ToolContext) {
  // --- Nutrition (optional module; each service call checks nutrition.enabled) ---
  tool(
    'search_nutrition',
    'Look a product up on Open Food Facts by name: returns candidates with their barcode and nutrition per 100 g. Pick one with set_product_nutrition (code). Only the search text is sent to Open Food Facts.',
    s.nutritionSearch.shape,
    ro,
    (a) => nutrition.search(a),
  );
  tool(
    'set_product_nutrition',
    'Keep nutrition values on a product: pass the barcode of an Open Food Facts product (from search_nutrition) or values per 100 g typed by hand. Pass neither to clear them.',
    s.productNutritionSet.shape,
    rw,
    (a) => nutrition.setProduct(a),
  );
  tool(
    'autofill_recipe_nutrition',
    'Fill missing nutrition values on the ingredients of a recipe from Open Food Facts by name. Manual values are kept.',
    s.idParam.shape,
    rw,
    async (a) => ({ filled: await nutrition.autofillRecipe(a.id) }),
  );
  tool(
    'get_recipe_nutrition',
    'Calories and macros of a recipe, in total and per serving. coverage.missing lists ingredients without values: totals are then a lower bound.',
    s.idParam.shape,
    ro,
    (a) => nutrition.recipe(a.id),
  );
  tool(
    'get_meal_plan_nutrition',
    'What one person eats per day (calories, protein, carbs, fat, fiber...) from the planned recipes between two dates. Free-text meals are not counted.',
    s.nutritionPlan.shape,
    ro,
    (a) => nutrition.plan(a),
  );
}
