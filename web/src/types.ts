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

export interface TokenInfo {
  id: number;
  /** Set for personal tokens; null for apps authorised through OAuth. */
  name: string | null;
  clientId: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
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
}

export interface StockAlerts {
  lowStock: { productId: number; name: string; unit: string; current: number; minStock: number }[];
  expiring: StockItem[];
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
  ingredients: { name: string; unit: string; needed: number; inStock: number; missing: number; staple?: true; toTaste?: true; approximate?: true }[];
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
export const ALLERGENS = ['gluten', 'crustaceans', 'molluscs', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin'] as const;

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
