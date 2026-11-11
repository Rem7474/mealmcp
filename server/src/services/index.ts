import type { Db } from '../db/index.js';
import { createBudgetService } from './budget.js';
import { createEquipmentService } from './equipment.js';
import { createPlannerService } from './planner.js';
import { createProductService } from './products.js';
import { createRecipeService } from './recipes.js';
import { createSettingsService } from './settings.js';
import { createShoppingService } from './shopping.js';
import { createStockService } from './stock.js';

/**
 * The single place where kitchen business logic lives. The REST API and the MCP
 * server are thin adapters over these services, so both always behave the same.
 *
 * Services are bound to one household: every query is filtered on it, so a
 * caller can never read or touch another household's data by guessing ids.
 * Build one set per request, from the authenticated user's household.
 */
export function createServices(db: Db, householdId: number) {
  const settings = createSettingsService(db, householdId);
  const products = createProductService(db, householdId);
  const stock = createStockService(db, householdId, products);
  const equipment = createEquipmentService(db, householdId);
  const recipes = createRecipeService(db, householdId, products, stock, settings, equipment);
  const planner = createPlannerService(db, householdId, recipes, stock, settings);
  const budget = createBudgetService(db, householdId, products, stock, recipes, planner);
  const shopping = createShoppingService(db, householdId, products, stock, recipes, planner, budget);
  return { settings, equipment, products, stock, recipes, planner, budget, shopping };
}

export type Services = ReturnType<typeof createServices>;
