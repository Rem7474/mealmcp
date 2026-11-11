import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../db/index.js';
import { expenseItems, expenses, households, products } from '../db/schema.js';
import { today } from '../domain/dates.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { costCents, toCents } from '../domain/pricing.js';
import type { budgetSet, expenseList, expenseRecord, productPrice, recipeAvailability, spendingSummary } from '../domain/schemas.js';
import { toBase } from '../domain/units.js';
import type { PlannerService } from './planner.js';
import type { ProductService } from './products.js';
import type { RecipeService } from './recipes.js';
import type { StockService } from './stock.js';

const monthOf = (isoDate: string) => isoDate.slice(0, 7);

export function createBudgetService(db: Db, hid: number, productService: ProductService, stock: StockService, recipes: RecipeService, planner: PlannerService) {
  const mine = eq(expenses.householdId, hid);
  const inRange = (from?: string, to?: string) => and(mine, from ? gte(expenses.date, from) : undefined, to ? lte(expenses.date, to) : undefined);

  const svc = {
    household() {
      const row = db.select().from(households).where(eq(households.id, hid)).get();
      if (!row) throw new NotFoundError('Household', hid);
      return row;
    },

    // --- Expenses -----------------------------------------------------------

    /**
     * Records a purchase. Lines with a quantity also teach us the product's price, which is
     * what recipe, meal-plan and shopping-list estimates are computed from.
     */
    recordExpense(input: z.input<typeof expenseRecord>) {
      const { items: receiptItems = [], addToStock = false, location = 'pantry' } = input;
      if (receiptItems.length === 0 && input.total === undefined) throw new ValidationError('Provide receipt items or a total');
      const date = input.date ?? today();
      const lines = receiptItems.map((item) => {
        const product = productService.findOrCreate(item.name, item.unit);
        const base = item.quantity !== undefined ? toBase(item.quantity, item.unit ?? product.defaultUnit) : null;
        return { item, product, base, priceCents: toCents(item.price) };
      });
      const totalCents = input.total !== undefined ? toCents(input.total) : lines.reduce((sum, l) => sum + l.priceCents, 0);

      const id = db.transaction(() => {
        const expense = db
          .insert(expenses)
          .values({ householdId: hid, date, store: input.store ?? null, note: input.note ?? null, totalCents, createdAt: Date.now() })
          .returning()
          .get();
        for (const { item, product, base, priceCents } of lines) {
          db.insert(expenseItems)
            .values({
              expenseId: expense.id,
              productId: product.id,
              name: product.name,
              quantity: base?.quantity ?? null,
              unit: base?.unit ?? null,
              priceCents,
            })
            .run();
          if (base && base.quantity > 0 && priceCents > 0)
            db.update(products)
              .set({ unitPrice: priceCents / base.quantity, priceUnit: base.unit })
              .where(and(eq(products.householdId, hid), eq(products.id, product.id)))
              .run();
          if (addToStock && item.quantity !== undefined) stock.add({ name: item.name, quantity: item.quantity, unit: item.unit, location });
        }
        return expense.id;
      });
      return svc.getExpense(id);
    },

    getExpense(id: number) {
      const expense = db.select().from(expenses).where(and(mine, eq(expenses.id, id))).get();
      if (!expense) throw new NotFoundError('Expense', id);
      const items = db.select().from(expenseItems).where(eq(expenseItems.expenseId, id)).orderBy(asc(expenseItems.id)).all();
      return { ...expense, items };
    },

    listExpenses(filter: z.infer<typeof expenseList> = {}) {
      return db
        .select({
          id: expenses.id,
          date: expenses.date,
          store: expenses.store,
          note: expenses.note,
          totalCents: expenses.totalCents,
          itemCount: sql<number>`(select count(*) from expense_items ei where ei.expense_id = expenses.id)`,
        })
        .from(expenses)
        .where(inRange(filter.from, filter.to))
        .orderBy(desc(expenses.date), desc(expenses.id))
        .all();
    },

    deleteExpense(id: number) {
      svc.getExpense(id);
      db.delete(expenses).where(and(mine, eq(expenses.id, id))).run();
    },

    // --- Summaries and budget ---------------------------------------------------

    summary({ from, to }: z.infer<typeof spendingSummary>) {
      const where = inRange(from, to);
      const totalRow = db
        .select({ total: sql<number>`coalesce(sum(${expenses.totalCents}), 0)`, count: sql<number>`count(*)` })
        .from(expenses)
        .where(where)
        .get()!;
      const byStore = db
        .select({ store: expenses.store, totalCents: sql<number>`sum(${expenses.totalCents})`, count: sql<number>`count(*)` })
        .from(expenses)
        .where(where)
        .groupBy(expenses.store)
        .orderBy(desc(sql`sum(${expenses.totalCents})`))
        .all();
      const byMonth = db
        .select({ month: sql<string>`substr(${expenses.date}, 1, 7)`, totalCents: sql<number>`sum(${expenses.totalCents})` })
        .from(expenses)
        .where(where)
        .groupBy(sql`substr(${expenses.date}, 1, 7)`)
        .orderBy(sql`substr(${expenses.date}, 1, 7)`)
        .all();
      // Per category, from receipt lines (a line without a known category is "uncategorised").
      const byCategory = db
        .select({ category: products.category, totalCents: sql<number>`sum(${expenseItems.priceCents})` })
        .from(expenseItems)
        .innerJoin(expenses, eq(expenses.id, expenseItems.expenseId))
        .leftJoin(products, eq(products.id, expenseItems.productId))
        .where(where)
        .groupBy(products.category)
        .orderBy(desc(sql`sum(${expenseItems.priceCents})`))
        .all();
      // Purchases recorded with a total only (no receipt lines) cannot be split by category.
      const notItemisedCents =
        db
          .select({ total: sql<number>`coalesce(sum(${expenses.totalCents}), 0)` })
          .from(expenses)
          .where(and(where, sql`not exists (select 1 from expense_items ei where ei.expense_id = expenses.id)`))
          .get()?.total ?? 0;
      return { from, to, currency: svc.household().currency, totalCents: totalRow.total, expenseCount: totalRow.count, byStore, byMonth, byCategory, notItemisedCents };
    },

    /** Spending this month against the monthly budget, with a straight-line projection to month end. */
    budgetStatus() {
      const household = svc.household();
      const now = today();
      const month = monthOf(now);
      const [year, monthNumber] = month.split('-').map(Number);
      const daysInMonth = new Date(year, monthNumber, 0).getDate();
      const day = Number(now.slice(8, 10));
      const spentCents =
        db
          .select({ total: sql<number>`coalesce(sum(${expenses.totalCents}), 0)` })
          .from(expenses)
          .where(and(mine, gte(expenses.date, `${month}-01`), lte(expenses.date, `${month}-31`)))
          .get()?.total ?? 0;
      const budgetCents = household.monthlyBudgetCents;
      return {
        currency: household.currency,
        month,
        budgetCents,
        spentCents,
        remainingCents: budgetCents === null ? null : budgetCents - spentCents,
        projectedCents: Math.round((spentCents / day) * daysInMonth),
        daysInMonth,
        day,
      };
    },

    setBudget({ monthly, currency }: z.infer<typeof budgetSet>) {
      db.update(households)
        .set({ ...(monthly !== undefined ? { monthlyBudgetCents: monthly === null ? null : toCents(monthly) } : {}), ...(currency ? { currency } : {}) })
        .where(eq(households.id, hid))
        .run();
      return svc.budgetStatus();
    },

    // --- Prices and cost estimates ------------------------------------------------

    /** Sets what a product costs, e.g. 2.49 for 1 kg of flour. */
    setProductPrice(input: z.infer<typeof productPrice>) {
      const product = productService.findOrCreate(input.name, input.unit);
      const base = toBase(input.quantity, input.unit ?? product.defaultUnit);
      db.update(products)
        .set({ unitPrice: toCents(input.price) / base.quantity, priceUnit: base.unit })
        .where(and(eq(products.householdId, hid), eq(products.id, product.id)))
        .run();
      return productService.get(product.id);
    },

    /** Cost of one recipe at a given number of servings, from the last known product prices. */
    recipeCost({ id, servings }: z.infer<typeof recipeAvailability>) {
      const recipe = recipes.get(id);
      const scale = (servings ?? recipe.servings) / recipe.servings;
      const byId = new Map(productService.list().map((p) => [p.id, p]));
      let total = 0;
      const unpriced: string[] = [];
      for (const ing of recipe.ingredients) {
        if (ing.toTaste || byId.get(ing.productId)!.isStaple) continue; // not counted, not bought
        const cost = costCents(byId.get(ing.productId)!, ing.quantity * scale, ing.unit);
        if (cost === null) unpriced.push(ing.name);
        else total += cost;
      }
      const servingsUsed = servings ?? recipe.servings;
      return {
        recipeId: recipe.id,
        name: recipe.name,
        servings: servingsUsed,
        currency: svc.household().currency,
        totalCents: Math.round(total),
        perServingCents: Math.round(total / servingsUsed),
        /** Ingredients with no price in the right unit: the total is a lower bound while this is not empty. */
        unpricedIngredients: unpriced,
      };
    },

    planCost(range: { from: string; to: string }) {
      const meals = planner.list(range).map((meal) => {
        if (!meal.recipeId) return { id: meal.id, date: meal.date, name: meal.title ?? '', costCents: null as number | null, unpricedIngredients: [] as string[] };
        const cost = svc.recipeCost({ id: meal.recipeId, servings: meal.servings });
        return { id: meal.id, date: meal.date, name: cost.name, costCents: cost.totalCents, unpricedIngredients: cost.unpricedIngredients };
      });
      return {
        ...range,
        currency: svc.household().currency,
        totalCents: meals.reduce((sum, m) => sum + (m.costCents ?? 0), 0),
        meals,
        /** Meals whose cost is incomplete (no recipe, or ingredients without a price). */
        incompleteMeals: meals.filter((m) => m.costCents === null || m.unpricedIngredients.length > 0).length,
      };
    },
  };
  return svc;
}

export type BudgetService = ReturnType<typeof createBudgetService>;
