import { describe, expect, it } from 'vitest';
import * as catalog from './schemas/catalog.js';
import * as stock from './schemas/stock.js';
import * as schemas from './schemas.js';

describe('schemas barrel', () => {
  it('re-exports exactly the public schemas, not the building blocks', () => {
    expect(Object.keys(schemas).sort()).toEqual(
      [
        'EQUIPMENT_KINDS',
        'aiChat',
        'aiWeekPlanStart',
        'aliasAdd',
        'aliasRemove',
        'budgetSet',
        'catalogCode',
        'catalogLookup',
        'catalogSearch',
        'equipmentAdd',
        'equipmentUpdate',
        'expenseList',
        'expenseRecord',
        'idParam',
        'mealContext',
        'mealHistory',
        'nutritionPlan',
        'nutritionSearch',
        'planAdd',
        'planAddMany',
        'planList',
        'planSlots',
        'planUpdate',
        'productNutritionSet',
        'productPrice',
        'productRefParam',
        'productUpdate',
        'productUpdateByRef',
        'productUpdateMany',
        'purchaseApply',
        'purchaseText',
        'recipeAvailability',
        'recipeCreate',
        'recipeCreateMany',
        'recipeList',
        'recipeUpdate',
        'seasonList',
        'settingsSet',
        'shoppingAdd',
        'shoppingAddMany',
        'shoppingCheck',
        'shoppingComplete',
        'shoppingGenerate',
        'spendingSummary',
        'stockAdd',
        'stockAddFromCode',
        'stockAddMany',
        'stockAddOrCode',
        'stockConsume',
        'stockDiscard',
        'stockFreeze',
        'stockFreezeByRef',
        'stockFreezeOrThawByRef',
        'stockLineRef',
        'stockList',
        'stockOpen',
        'stockOpenByRef',
        'stockUpdate',
        'stockUpdateByRef',
        'stockUpdateMany',
        'suggestRecipes',
        'wasteSummary',
        'weekPlanChoose',
        'weekPlanStart',
        'weekSlotParams',
      ].sort(),
    );
  });

  it('hands out the same objects as the domain files', () => {
    expect(schemas.stockAdd).toBe(stock.stockAdd);
    expect(schemas.stockAddOrCode).toBe(catalog.stockAddOrCode);
  });

  it('keeps coercing query strings the way the routes expect', () => {
    expect(schemas.idParam.parse({ id: '12' })).toEqual({ id: 12 });
    expect(schemas.suggestRecipes.parse({ ignoreDiet: 'false' }).ignoreDiet).toBe(false);
    expect(schemas.suggestRecipes.parse({ ignoreDiet: '1' }).ignoreDiet).toBe(true);
  });
});
