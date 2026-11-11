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
}

export interface StockAlerts {
  lowStock: { productId: number; name: string; unit: string; current: number; minStock: number }[];
  expiring: StockItem[];
}

export interface RecipeSummary {
  id: number;
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  ingredientCount: number;
}

export interface Ingredient {
  id: number;
  productId: number;
  name: string;
  quantity: number;
  unit: string;
  note: string | null;
}

export interface Recipe extends Omit<RecipeSummary, 'ingredientCount'> {
  instructions: string | null;
  ingredients: Ingredient[];
}

export interface Availability {
  canCook: boolean;
  servings: number;
  ingredients: { name: string; unit: string; needed: number; inStock: number; missing: number }[];
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
}
