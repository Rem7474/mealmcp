import { type Request, Router } from 'express';
import type { Db } from '../db/index.js';
import * as c from '../domain/catalogSchemas.js';
import * as s from '../domain/schemas.js';
import { createServices } from '../services/index.js';
import { starterQuery, starterRecipesAdd, starterStockAdd } from '../services/starter.js';

/** REST routes for the kitchen itself (stock, recipes, plan, shopping, budget...), for a signed-in caller. */
export function createKitchenRoutes(db: Db) {
  const r = Router();
  const id = (params: unknown) => s.idParam.parse(params).id;
  /** Kitchen services bound to the caller's household. */
  const kitchen = (req: Request) => createServices(db, req.user!.householdId);

  r.get('/starter', (req, res) => void res.json(kitchen(req).starter.overview(starterQuery.parse(req.query))));
  r.post('/starter/stock', (req, res) => void res.status(201).json(kitchen(req).starter.addStock(starterStockAdd.parse(req.body))));
  r.post(
    '/starter/recipes',
    (req, res) => void res.status(201).json(kitchen(req).starter.importRecipes(starterRecipesAdd.parse(req.body))),
  );
  r.get('/equipment', (req, res) => void res.json(kitchen(req).equipment.list()));
  r.post('/equipment', (req, res) => void res.status(201).json(kitchen(req).equipment.add(s.equipmentAdd.parse(req.body))));
  r.patch(
    '/equipment/:id',
    (req, res) =>
      void res.json(kitchen(req).equipment.update({ ...s.equipmentUpdate.omit({ id: true }).parse(req.body), id: id(req.params) })),
  );
  r.delete('/equipment/:id', (req, res) => {
    kitchen(req).equipment.remove(id(req.params));
    res.status(204).end();
  });
  r.get('/settings', (req, res) => void res.json(kitchen(req).settings.get()));
  r.put('/settings', (req, res) => void res.json(kitchen(req).settings.set(s.settingsSet.parse(req.body))));
  r.post('/products/alias', (req, res) => void res.status(201).json(kitchen(req).products.addAlias(s.aliasAdd.parse(req.body))));
  r.delete('/products/alias', (req, res) => {
    kitchen(req).products.removeAlias(s.aliasRemove.parse(req.query).alias);
    res.status(204).end();
  });
  r.get('/products', (req, res) => void res.json(kitchen(req).products.list()));
  r.get('/prices', (req, res) => void res.json(kitchen(req).prices.overview()));
  r.get('/products/:id', (req, res) => void res.json(kitchen(req).productSheet.get(id(req.params))));
  r.get('/products/:id/prices', (req, res) => void res.json(kitchen(req).prices.history(id(req.params))));
  r.patch(
    '/products/:id',
    (req, res) => void res.json(kitchen(req).products.update(s.productUpdate.parse({ ...req.body, id: id(req.params) }))),
  );

  r.get('/stock', (req, res) => void res.json(kitchen(req).stock.list(s.stockList.parse(req.query))));
  r.get('/stock/alerts', (req, res) => void res.json(kitchen(req).stock.alerts()));
  r.post('/stock', async (req, res) => {
    const k = kitchen(req);
    // A barcode settles the product and the pack size; without one this is the plain add.
    const line =
      req.body?.barcode !== undefined
        ? await k.catalog.addStock(c.stockAddFromCode.parse(req.body))
        : k.stock.add(s.stockAdd.parse(req.body));
    res.status(201).json(line);
  });
  r.get('/catalog/products/:code', async (req, res) => {
    const q = c.catalogCode.parse({ code: req.params.code, lang: req.query.lang });
    res.json(await kitchen(req).catalog.product(q.code, q.lang));
  });
  r.get('/catalog/search', async (req, res) => {
    const q = c.catalogSearch.parse(req.query);
    res.json(await kitchen(req).catalog.search(q.q, q.lang));
  });
  r.post('/stock/bulk', (req, res) => void res.status(201).json(kitchen(req).stock.addMany(s.stockAddMany.parse(req.body).items)));
  r.post('/stock/:id/unopen', (req, res) => void res.json(kitchen(req).stock.unopen(id(req.params))));
  r.post(
    '/stock/:id/freeze',
    (req, res) => void res.json(kitchen(req).stock.freeze(s.stockFreeze.parse({ ...req.body, id: id(req.params) }))),
  );
  r.post('/stock/:id/thaw', (req, res) => void res.json(kitchen(req).stock.thaw(id(req.params))));
  r.post('/stock/:id/open', (req, res) => void res.json(kitchen(req).stock.open(s.stockOpen.parse({ ...req.body, id: id(req.params) }))));
  r.post('/stock/consume', (req, res) => void res.json(kitchen(req).stock.consume(s.stockConsume.parse(req.body))));
  r.patch('/stock/:id', (req, res) => void res.json(kitchen(req).stock.update(s.stockUpdate.parse({ ...req.body, id: id(req.params) }))));
  r.delete('/stock/:id', (req, res) => {
    kitchen(req).stock.remove(id(req.params));
    res.status(204).end();
  });

  r.get('/recipes', (req, res) => void res.json(kitchen(req).recipes.list(s.recipeList.parse(req.query))));
  r.get('/recipes/suggest', (req, res) => void res.json(kitchen(req).recipes.suggest(s.suggestRecipes.parse(req.query))));
  r.post(
    '/recipes/bulk',
    (req, res) => void res.status(201).json(kitchen(req).recipes.createMany(s.recipeCreateMany.parse(req.body).recipes)),
  );
  r.get('/recipes/:id', (req, res) => void res.json(kitchen(req).recipes.get(id(req.params))));
  r.get(
    '/recipes/:id/availability',
    (req, res) => void res.json(kitchen(req).recipes.availability(s.recipeAvailability.parse({ ...req.query, id: id(req.params) }))),
  );
  r.get('/recipes/:id/stats', (req, res) => void res.json(kitchen(req).planner.recipeStats(id(req.params))));
  r.post('/recipes', (req, res) => void res.status(201).json(kitchen(req).recipes.create(s.recipeCreate.parse(req.body))));
  r.patch(
    '/recipes/:id',
    (req, res) => void res.json(kitchen(req).recipes.update(s.recipeUpdate.parse({ ...req.body, id: id(req.params) }))),
  );
  r.delete('/recipes/:id', (req, res) => {
    kitchen(req).recipes.remove(id(req.params));
    res.status(204).end();
  });

  r.get('/plan', (req, res) => void res.json(kitchen(req).planner.list(s.planList.parse(req.query))));
  r.get('/nutrition/search', async (req, res) => void res.json(await kitchen(req).nutrition.search(s.nutritionSearch.parse(req.query))));
  r.get('/nutrition/plan', (req, res) => void res.json(kitchen(req).nutrition.plan(s.nutritionPlan.parse(req.query))));
  r.get('/recipes/:id/nutrition', (req, res) => void res.json(kitchen(req).nutrition.recipe(id(req.params))));
  r.post(
    '/recipes/:id/nutrition/autofill',
    async (req, res) => void res.json({ filled: await kitchen(req).nutrition.autofillRecipe(id(req.params)) }),
  );
  r.put(
    '/products/:id/nutrition',
    async (req, res) =>
      void res.json(await kitchen(req).nutrition.setProduct(s.productNutritionSet.parse({ ...req.body, id: id(req.params) }))),
  );
  r.get('/seasons', (req, res) => void res.json(kitchen(req).seasons.list(s.seasonList.parse(req.query))));
  r.get('/plan/history', (req, res) => void res.json(kitchen(req).planner.history(s.mealHistory.parse(req.query))));
  r.get('/context', (req, res) => void res.json(kitchen(req).context.get(s.mealContext.parse(req.query))));
  r.get('/next-actions', (req, res) => void res.json(kitchen(req).nextActions.get()));
  r.get('/waste', (req, res) => void res.json(kitchen(req).stock.wasteSummary(s.wasteSummary.parse(req.query))));
  r.post(
    '/stock/:id/discard',
    (req, res) => void res.json(kitchen(req).stock.discard(s.stockDiscard.parse({ ...req.body, id: id(req.params) }))),
  );
  r.get('/plan/slots', (req, res) => void res.json(kitchen(req).planner.slots(s.planSlots.parse(req.query))));
  r.get('/plan/week', (req, res) => void res.json(kitchen(req).weekPlan.current()));
  r.post('/plan/week', (req, res) => void res.status(201).json(kitchen(req).weekPlan.start(s.weekPlanStart.parse(req.body), req.user!.id)));
  r.get('/plan/week/:id', (req, res) => void res.json(kitchen(req).weekPlan.get(id(req.params))));
  r.post('/plan/week/:id/accept-all', (req, res) => void res.json(kitchen(req).weekPlan.acceptAll(id(req.params))));
  r.post('/plan/week/:id/apply', (req, res) => void res.json(kitchen(req).weekPlan.apply(id(req.params))));
  r.post('/plan/week/:id/slots/:key/accept', (req, res) => {
    const p = s.weekSlotParams.parse(req.params);
    res.json(kitchen(req).weekPlan.accept(p.id, p.key));
  });
  r.post('/plan/week/:id/slots/:key/refuse', (req, res) => {
    const p = s.weekSlotParams.parse(req.params);
    res.json(kitchen(req).weekPlan.refuse(p.id, p.key));
  });
  r.post('/plan/week/:id/slots/:key/choose', (req, res) => {
    const p = s.weekSlotParams.parse(req.params);
    res.json(kitchen(req).weekPlan.choose(p.id, p.key, s.weekPlanChoose.parse(req.body).recipeId));
  });
  r.post('/plan/bulk', (req, res) => void res.status(201).json(kitchen(req).planner.addMany(s.planAddMany.parse(req.body).meals)));
  r.post('/plan', (req, res) => void res.status(201).json(kitchen(req).planner.add(s.planAdd.parse(req.body))));
  r.patch('/plan/:id', (req, res) => void res.json(kitchen(req).planner.update(s.planUpdate.parse({ ...req.body, id: id(req.params) }))));
  r.post('/plan/:id/cook', (req, res) => void res.json(kitchen(req).planner.cook(id(req.params))));
  r.delete('/plan/:id', (req, res) => {
    kitchen(req).planner.remove(id(req.params));
    res.status(204).end();
  });

  r.get('/shopping', (req, res) => void res.json(kitchen(req).shopping.list()));
  r.post('/shopping/bulk', (req, res) => void res.status(201).json(kitchen(req).shopping.addMany(s.shoppingAddMany.parse(req.body).items)));
  r.post('/shopping', (req, res) => void res.status(201).json(kitchen(req).shopping.add(s.shoppingAdd.parse(req.body))));
  r.post('/shopping/from-text', (req, res) => void res.json(kitchen(req).purchase.parse(s.purchaseText.parse(req.body).text)));
  r.post('/shopping/from-text/apply', (req, res) => void res.json(kitchen(req).purchase.apply(s.purchaseApply.parse(req.body))));
  r.post('/shopping/generate', (req, res) => void res.json(kitchen(req).shopping.generateFromPlan(s.shoppingGenerate.parse(req.body))));
  r.post('/shopping/complete', (req, res) => {
    const { location, ...opts } = s.shoppingComplete.parse(req.body ?? {});
    res.json(kitchen(req).shopping.completePurchase(location, opts));
  });
  r.get('/shopping/waste-risks', (req, res) => void res.json(kitchen(req).shopping.wasteRisks()));
  r.get('/shopping/estimate', (req, res) => void res.json(kitchen(req).shopping.estimate()));
  r.patch('/shopping/:id', (req, res) => {
    const shopping = kitchen(req).shopping;
    // A price or quantity edit alone must not change whether the item is checked.
    const current = shopping.get(id(req.params));
    const { checked, price, quantity, location } = s.shoppingCheck.parse({ checked: current.checked, ...req.body, id: id(req.params) });
    res.json(shopping.setChecked(id(req.params), checked, price, quantity, location));
  });
  r.delete('/shopping/:id', (req, res) => {
    kitchen(req).shopping.remove(id(req.params));
    res.status(204).end();
  });

  // --- Budget -----------------------------------------------------------------

  r.get('/budget/status', (req, res) => void res.json(kitchen(req).budget.budgetStatus()));
  r.put('/budget', (req, res) => void res.json(kitchen(req).budget.setBudget(s.budgetSet.parse(req.body))));
  r.get('/budget/summary', (req, res) => void res.json(kitchen(req).budget.summary(s.spendingSummary.parse(req.query))));
  r.get('/budget/plan-cost', (req, res) => void res.json(kitchen(req).budget.planCost(s.planList.parse(req.query))));
  r.get(
    '/recipes/:id/cost',
    (req, res) => void res.json(kitchen(req).budget.recipeCost(s.recipeAvailability.parse({ ...req.query, id: id(req.params) }))),
  );
  r.post('/products/price', (req, res) => void res.json(kitchen(req).budget.setProductPrice(s.productPrice.parse(req.body))));
  r.get('/expenses', (req, res) => void res.json(kitchen(req).budget.listExpenses(s.expenseList.parse(req.query))));
  r.get('/expenses/:id', (req, res) => void res.json(kitchen(req).budget.getExpense(id(req.params))));
  r.post('/expenses', (req, res) => void res.status(201).json(kitchen(req).budget.recordExpense(s.expenseRecord.parse(req.body))));
  r.delete('/expenses/:id', (req, res) => {
    kitchen(req).budget.deleteExpense(id(req.params));
    res.status(204).end();
  });

  return r;
}
