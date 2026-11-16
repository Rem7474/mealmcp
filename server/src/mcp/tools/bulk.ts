import { today } from '../../domain/dates.js';
import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerBulkTools({ settings, equipment, products, stock, recipes, planner, shopping, tool, ro, rw, del }: ToolContext) {
  // --- Bulk, aliases, settings, planning help ----------------------------------------
  tool(
    'add_stock_bulk',
    'Add many stock lines in one call (all or nothing). Same fields as add_stock, in an items array.',
    s.stockAddMany.shape,
    rw,
    (a) => stock.addMany(a.items),
  );
  tool(
    'create_recipes_bulk',
    'Create many recipes in one call (all or nothing). Same fields as create_recipe, in a recipes array.',
    s.recipeCreateMany.shape,
    rw,
    (a) => recipes.createMany(a.recipes),
  );
  tool(
    'plan_meals_bulk',
    'Plan many meals in one call (all or nothing). Same fields as plan_meal, in a meals array.',
    s.planAddMany.shape,
    rw,
    (a) => planner.addMany(a.meals),
  );
  tool(
    'add_shopping_items_bulk',
    'Add many shopping list items in one call (all or nothing). Same fields as add_shopping_item, in an items array.',
    s.shoppingAddMany.shape,
    rw,
    (a) => shopping.addMany(a.items),
  );
  tool(
    'add_product_alias',
    'Teach another name for a product (e.g. the wording on a receipt), so receipts, recipes and lists using it resolve to the same product.',
    s.aliasAdd.shape,
    rw,
    (a) => products.addAlias(a),
  );
  tool('remove_product_alias', 'Remove an alias of a product.', s.aliasRemove.shape, del, (a) => products.removeAlias(a.alias));
  tool(
    'list_equipment',
    'Appliances (air fryer, oven...) and utensils the household owns, plus ones recipes need that it does not have (owned=false).',
    {},
    ro,
    () => equipment.list(),
  );
  tool(
    'add_equipment',
    'Record an appliance or utensil the household has (owned=true, default) or a missing one. Idempotent by name.',
    s.equipmentAdd.shape,
    rw,
    (a) => equipment.add(a),
  );
  tool('update_equipment', 'Rename an item, change its kind, or mark it owned/not owned.', s.equipmentUpdate.shape, rw, (a) =>
    equipment.update(a),
  );
  tool('remove_equipment', 'Delete an appliance or utensil (also removes it from recipes that required it).', s.idParam.shape, del, (a) =>
    equipment.remove(a.id),
  );
  tool(
    'get_household_settings',
    'Household preferences: default servings, planned meals by weekday, country and hemisphere (seasonal calendar), diets, allergens and ingredients to avoid.',
    {},
    ro,
    () => settings.get(),
  );
  tool(
    'set_household_settings',
    'Set the default number of servings, the weekly meal pattern (plannedMeals replaces the whole pattern), the country and hemisphere (seasonal calendar) and the diet object (diets, allergens, avoid; replaces the whole object).',
    s.settingsSet.shape,
    rw,
    (a) => settings.set(a),
  );
  tool(
    'list_planning_slots',
    'Meals the household expects to plan (from its settings) that have nothing planned yet between two dates: the empty slots to fill with plan_meal / plan_meals_bulk.',
    s.planSlots.shape,
    ro,
    (a) => ({ today: today(), slots: planner.slots(a) }),
  );
  tool(
    'suggest_recipes_to_use_up',
    'Recipes that use up what is about to expire (or the products you name), best first: which expiring items each uses, whether it can be cooked now, and what is missing.',
    s.suggestRecipes.shape,
    ro,
    (a) => recipes.suggest(a),
  );
}
