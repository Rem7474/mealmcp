import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerRecipesTools({ recipes, tool, ro, rw, del }: ToolContext) {
  // --- Recipes -------------------------------------------------------------
  tool('list_recipes', 'List recipes (summary). Optionally search by recipe or ingredient name.', s.recipeList.shape, ro, (a) =>
    recipes.list(a),
  );
  tool('get_recipe', 'Get a recipe with its ingredients and steps.', s.idParam.shape, ro, (a) => recipes.get(a.id));
  tool('create_recipe', 'Create a recipe with its ingredient list.', s.recipeCreate.shape, rw, (a) => recipes.create(a));
  tool('update_recipe', 'Update a recipe. Passing ingredients replaces the whole ingredient list.', s.recipeUpdate.shape, rw, (a) =>
    recipes.update(a),
  );
  tool('delete_recipe', 'Delete a recipe and its planned occurrences.', s.idParam.shape, del, (a) => recipes.remove(a.id));
  tool(
    'check_recipe_availability',
    'Compare what a recipe needs with the current stock: per ingredient needed / in stock / missing.',
    s.recipeAvailability.shape,
    ro,
    (a) => recipes.availability(a),
  );
}
