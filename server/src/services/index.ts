import type { Db } from '../db/index.js';
import { createBudgetService } from './budget.js';
import { createCatalogService } from './catalog.js';
import { createContextService } from './context.js';
import { createEquipmentService } from './equipment.js';
import { createNextActionsService } from './nextActions.js';
import { createNutritionService } from './nutrition.js';
import { createPlannerService } from './planner.js';
import { createPriceService } from './prices.js';
import { createProductSheetService } from './productSheet.js';
import { createProductService } from './products.js';
import { createPurchaseService } from './purchase.js';
import { createRecipeService } from './recipes.js';
import { createSeasonService } from './seasons.js';
import { createSettingsService } from './settings.js';
import { createShoppingService } from './shopping.js';
import { createStarterService } from './starter.js';
import { createStockService } from './stock.js';
import { createWeekPlanService } from './weekPlan.js';

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
  const seasons = createSeasonService(settings);
  const recipes = createRecipeService(db, householdId, products, stock, settings, equipment, seasons);
  const planner = createPlannerService(db, householdId, recipes, stock, settings);
  const nutrition = createNutritionService(db, householdId, settings, products, recipes, planner);
  const prices = createPriceService(db, householdId, products);
  const productSheet = createProductSheetService(db, householdId, products, stock, prices);
  const budget = createBudgetService(db, householdId, products, stock, recipes, planner, prices);
  const weekPlan = createWeekPlanService(db, householdId, recipes, planner, settings, products);
  const shopping = createShoppingService(db, householdId, products, stock, recipes, planner, budget, seasons);
  const purchase = createPurchaseService(db, products, stock, shopping, budget);
  const catalog = createCatalogService(householdId, products, stock);
  const starter = createStarterService(products, stock, recipes);
  const context = createContextService(settings, stock, recipes, planner, seasons, equipment, budget);
  const nextActions = createNextActionsService(stock, recipes, planner, shopping, budget);
  return {
    purchase,
    starter,
    weekPlan,
    catalog,
    nutrition,
    context,
    nextActions,
    settings,
    seasons,
    equipment,
    products,
    productSheet,
    stock,
    recipes,
    planner,
    budget,
    prices,
    shopping,
  };
}

export type Services = ReturnType<typeof createServices>;
