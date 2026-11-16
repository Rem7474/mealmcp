// Shapes returned by the REST API (see server/src/services).
export type Location = 'fridge' | 'freezer' | 'pantry';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'member';
  householdId: number;
  householdName: string;
  /** ISO 4217 code used to display money. */
  currency: string;
}

export interface Me {
  user: User | null;
  /** True when anyone may create a household (first account, or ALLOW_REGISTRATION). */
  registrationOpen: boolean;
}

export interface Household {
  id: number;
  name: string;
  members: { id: number; name: string; email: string; role: 'owner' | 'member' }[];
}

/** A browser signed in to the account. */
export interface SessionInfo {
  id: string;
  createdAt: number | null;
  lastSeenAt: number | null;
  expiresAt: number;
  userAgent: string | null;
  current: boolean;
}

export interface TokenInfo {
  id: number;
  /** Set for personal tokens; null for apps authorised through OAuth. */
  name: string | null;
  clientId: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
}

/** A price in the unit people read: cents per kg, per litre or per piece. */
export interface PricePer {
  cents: number;
  per: 'kg' | 'l' | 'piece';
}
/** The last known price, with the same price in another unit when the product has the conversion. */
export type ShownPrice = { main: PricePer; alt: PricePer | null } | null;

export interface PriceHistory {
  productId: number;
  name: string;
  per: PricePer['per'] | null;
  latestCents: number | null;
  averageCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  count: number;
  alternative: PricePer | null;
  byStore: { store: string; latestCents: number | null; averageCents: number | null; count: number }[];
  /** Lowest latest price among at least two shops. */
  cheapestStore: string | null;
  /** The latest price is well above the average. */
  high: boolean;
  /** A price in a unit that cannot be read per kg, litre or piece (can, pack): followed as typed. */
  freeform: { unit: string; latestCents: number; trend: 'up' | 'down' | 'stable' | null } | null;
  observations: { id: number; date: string; store: string | null; source: 'receipt' | 'manual'; cents: number | null }[];
}

/** One line per product with a price history (see GET /prices). */
export interface PriceOverview {
  productId: number;
  name: string;
  per: PricePer['per'] | null;
  latestCents: number | null;
  averageCents: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  high: boolean;
  cheapestStore: string | null;
  count: number;
}

export interface ProductBarcode {
  code: string;
  brand: string | null;
  packSize: number | null;
  unit: string | null;
  label: string | null;
}

/** What the catalogue (Open Food Facts) says about one barcode. */
export interface CatalogHit {
  code: string;
  name: string;
  genericName: string | null;
  brand: string | null;
  brands: string | null;
  packSize: { size: number; unit: 'g' | 'ml'; count: number } | null;
}

/** Answer of `GET /catalog/products/:code`: what the household already knows, else the catalogue's entry. */
export interface CatalogLookup {
  code: string;
  known: { productId: number; productName: string; packSize: number | null; unit: string | null } | null;
  hit: CatalogHit | null;
  suggestions: { id: number; name: string }[];
}

export interface Product {
  id: number;
  name: string;
  category: string | null;
  defaultUnit: string;
  minStock: number | null;
  /** Cents per 1 priceUnit (g, ml, piece, ...), when a price is known. */
  unitPrice: number | null;
  priceUnit: string | null;
  /** That price per kg, litre or piece. */
  pricePer: ShownPrice;
  /** Always at home: kept in recipes but never bought, missing or used up. */
  isStaple: boolean;
  gramsPerPiece: number | null;
  gramsPerMl: number | null;
  /** Best guess at the aisle from the name, when none is set. */
  suggestedCategory: string | null;
  /** Drained weight / net weight (beans, tuna: recipes count drained grams), when known. */
  drainedRatio: number | null;
  /** Days an opened pack keeps. */
  openedShelfLifeDays: number | null;
  /** Days it keeps frozen / once thawed; null: the default for its category. */
  frozenShelfLifeDays: number | null;
  thawedShelfLifeDays: number | null;
  brand: string | null;
  barcode: string | null;
  /** Every barcode of the product, one per format, with its pack size when known. */
  barcodes: ProductBarcode[];
  aliases: string[];
  /** Calories and macros per 100 g, when the nutrition module has them. */
  nutrition: { per100: NutrientValues; source: 'openfoodfacts' | 'manual'; code?: string; label?: string; auto?: boolean } | null;
}

export type NutrientValues = Partial<Record<'kcal' | 'protein' | 'carbs' | 'sugars' | 'fat' | 'saturatedFat' | 'fiber' | 'salt', number>>;

export interface NutritionHit {
  code: string;
  name: string;
  brands: string | null;
  per100: NutrientValues;
}

export interface RecipeNutritionInfo {
  recipeId: number;
  name: string;
  servings: number;
  total: Record<string, number>;
  perServing: Record<string, number>;
  coverage: { ingredients: number; covered: number; missing: string[]; complete: boolean };
}

export interface StockItem {
  id: number;
  pricePer: ShownPrice;
  /** What was paid for this line, per kg, litre or piece. */
  paidPer: ShownPrice;
  productId: number;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  location: Location;
  expiresOn: string | null;
  addedOn: string;
  /** "Plenty of it, amount unknown". */
  approximate: boolean;
  /** Size of one pack, when the line is kept in packs. */
  packSize: number | null;
  /** Sealed packs in the line (null when not kept in packs or already opened). */
  packCount: number | null;
  opened: boolean;
  openedOn: string | null;
  /** The date printed on the pack; `expiresOn` is the one the opened shelf life makes of it. */
  printedExpiresOn: string | null;
  /** What the date means: use by (unsafe after) or best before (quality only); null when not stated. */
  dateKind: 'use_by' | 'best_before' | null;
  /** Frozen or thawed here (the freezing / thawing date replaces the printed one as the clock). */
  frozen: boolean;
  thawed: boolean;
  frozenOn: string | null;
  thawedOn: string | null;
  /** Free text about this line. */
  note: string | null;
  brand: string | null;
  /** Where the line stands against its date: past a use-by date it is for the bin, past a best-before date a check. */
  expiryState: 'none' | 'ok' | 'soon' | 'check' | 'discard';
}

export interface StockAlerts {
  lowStock: { productId: number; name: string; unit: string; current: number; minStock: number }[];
  expiring: StockItem[];
  toDiscard: StockItem[];
  opened: StockItem[];
}

export interface RecipeSummary {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  tags: string[];
  ingredientCount: number;
  rating: number | null;
  favorite: boolean;
  /** Last time it was on the plan (up to today), and how often. */
  lastMadeOn: string | null;
  timesMade: number;
  /** Ingredients that break the household diet, allergens or dislikes. */
  dietConflicts: { ingredient: string; reasons: string[] }[];
}

export interface Ingredient {
  id: number;
  productId: number;
  name: string;
  quantity: number;
  unit: string;
  note: string | null;
  toTaste: boolean;
}

export interface RecipeStep {
  position: number;
  text: string;
  durationMinutes: number | null;
  temperatureC: number | null;
  appliance: string | null;
}

export interface Equipment {
  id: number;
  name: string;
  kind: 'appliance' | 'utensil';
  owned: boolean;
}

export interface Recipe extends Omit<RecipeSummary, 'ingredientCount'> {
  equipment: Equipment[];
  instructions: string | null;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  tags: string[];
}

export interface Availability {
  canCook: boolean;
  missingEquipment: string[];
  servings: number;
  ingredients: {
    name: string;
    unit: string;
    needed: number;
    inStock: number;
    missing: number;
    staple?: true;
    toTaste?: true;
    approximate?: true;
  }[];
}

export interface PlannedMeal {
  id: number;
  date: string;
  mealType: MealType;
  recipeId: number | null;
  recipeName: string | null;
  title: string | null;
  servings: number;
  cooked: boolean;
}

export interface ShoppingItem {
  id: number;
  productId: number;
  name: string;
  category: string | null;
  quantity: number | null;
  unit: string;
  checked: boolean;
  source: 'manual' | 'plan';
  /** Price entered on the line, in cents. */
  priceCents: number | null;
  /** Entered price, else quantity x last known unit price, else null. */
  estimatedCents: number | null;
  pricePer: ShownPrice;
  /** Planned meals this generated line is for, earliest first. */
  meals: { id: number; date: string; mealType: MealType; title: string; recipeId: number | null }[];
  /** Fruit and vegetables only: in season where the household lives, or not. */
  season: 'in' | 'out' | null;
  seasonAlternatives: { id: string; en: string; fr: string }[];
}

export interface BudgetStatus {
  currency: string;
  month: string;
  budgetCents: number | null;
  spentCents: number;
  remainingCents: number | null;
  projectedCents: number;
  daysInMonth: number;
  day: number;
}

export interface SpendingSummary {
  from: string;
  to: string;
  currency: string;
  totalCents: number;
  expenseCount: number;
  byStore: { store: string | null; totalCents: number; count: number }[];
  byMonth: { month: string; totalCents: number }[];
  byCategory: { category: string | null; totalCents: number }[];
  /** Purchases recorded with a total only, which cannot be split by category. */
  notItemisedCents: number;
}

export interface ExpenseSummary {
  id: number;
  date: string;
  store: string | null;
  note: string | null;
  totalCents: number;
  itemCount: number;
}

export interface Expense extends Omit<ExpenseSummary, 'itemCount'> {
  items: { id: number; name: string; quantity: number | null; unit: string | null; priceCents: number }[];
}

export interface RecipeCost {
  servings: number;
  totalCents: number;
  perServingCents: number;
  unpricedIngredients: string[];
}

export interface PlanCost {
  totalCents: number;
  incompleteMeals: number;
  meals: {
    id: number;
    costCents: number | null;
    unpricedIngredients: string[];
    /** Null for free-text meals. Judged on this meal alone, other planned meals are not subtracted. */
    canCook: boolean | null;
    missing: string[];
    missingEquipment: string[];
  }[];
}

export interface ShoppingEstimate {
  totalCents: number;
  pricedItems: number;
  unpricedItems: number;
}

export type MealTypeKey = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface HouseholdSettings {
  defaultServings?: number;
  shoppingGroupBy?: 'none' | 'aisle' | 'meal';
  /** Weekdays (0 = Sunday ... 6 = Saturday) on which each meal is expected. */
  plannedMeals?: Partial<Record<MealTypeKey, number[]>>;
  country?: Country;
  hemisphere?: 'north' | 'south';
  diet?: { diets?: string[]; allergens?: string[]; avoid?: string[] };
  nutrition?: { enabled: boolean };
}

export const COUNTRIES = ['FR', 'BE', 'CH', 'GB', 'CA', 'US'] as const;
export type Country = (typeof COUNTRIES)[number];
export const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'gluten_free', 'lactose_free', 'no_pork', 'no_alcohol'] as const;
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'molluscs',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
] as const;

export interface Produce {
  id: string;
  en: string;
  fr: string;
  kind: 'fruit' | 'vegetable' | 'herb';
}

export interface Seasonal {
  country: Country;
  hemisphere: 'north' | 'south';
  month: number;
  inSeason: Produce[];
  lastMonth: Produce[];
  startingNextMonth: Produce[];
}

export interface WasteSummary {
  from: string;
  to: string;
  totalCostCents: number;
  itemsThrownAway: number;
  unpricedItems: number;
  byProduct: { name: string; unit: string; quantity: number; costCents: number; times: number }[];
}

export interface PlanSlot {
  date: string;
  weekday: number;
  mealType: MealTypeKey;
}

export interface Suggestion {
  recipeId: number;
  name: string;
  tags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  usesExpiring: { name: string; expiresOn: string | null }[];
  canCook: boolean;
  missing: { name: string; unit: string; missing: number }[];
}

export interface Suggestions {
  expiring: { name: string; expiresOn: string | null }[];
  suggestions: Suggestion[];
}

export interface WeekPlanSlot {
  key: string;
  date: string;
  mealType: MealType;
  servings: number;
  status: 'proposed' | 'accepted' | 'refused' | 'empty';
  recipe: {
    id: number | null;
    name: string;
    prepMinutes: number | null;
    cookMinutes: number | null;
    reasons: string[];
    missing: string[];
    /** A recipe the AI drafted: it only exists once the plan is applied. */
    draft?: { ingredients: { name: string; quantity?: number; unit?: string; toTaste: boolean; isNew: boolean }[]; steps: string[] };
  } | null;
  alternatives: number;
  thinking?: boolean;
}

export interface WeekPlan {
  id: number;
  status: 'pending' | 'applied';
  source: 'rules' | 'llm';
  expiresAt: number;
  alreadyPlanned: { date: string; mealType: MealType }[];
  generating?: boolean;
  slots: WeekPlanSlot[];
}

export type Capability = 'yes' | 'no' | 'unknown';
export interface AiStatus {
  enabled: boolean;
  reachable: boolean;
  textModel: string | null;
  visionModel: string | null;
  text: boolean;
  vision: Capability;
}
export interface AiModel {
  id: string;
  vision: Capability;
}
export interface AiTest {
  reachable: boolean;
  model: boolean;
  json: boolean;
  vision: 'skipped' | 'ok' | 'failed';
}

export interface StarterProduct {
  key: string;
  name: string;
  staple: boolean;
  /** Already at home (in stock, or flagged as always there). */
  added: boolean;
}
export interface StarterRecipe {
  key: string;
  name: string;
  servings: number;
  minutes: number;
  tags: string[];
  ingredients: string[];
  imported: boolean;
}
export interface StarterOverview {
  aisles: { aisle: string; products: StarterProduct[] }[];
  recipes: StarterRecipe[];
}

/** What the landing page shows: facts only, the page words them. Shared with the server, which builds it. */
export type { ActionCard } from '../../server/src/domain/actionCard';

import type { ActionCard } from '../../server/src/domain/actionCard';

export interface NextActions {
  today: string;
  cards: ActionCard[];
  budget: (BudgetStatus & { state: 'none' | 'ok' | 'close' | 'over' }) | null;
}
