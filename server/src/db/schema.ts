import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const LOCATIONS = ['fridge', 'freezer', 'pantry'] as const;
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Location = (typeof LOCATIONS)[number];
export type MealType = (typeof MEAL_TYPES)[number];

// ---------------------------------------------------------------------------
// Accounts. A household owns all the kitchen data; users belong to one household.
// Timestamps in this section are epoch milliseconds.
// ---------------------------------------------------------------------------

export const households = sqliteTable('households', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  /** ISO 4217 code used to display money (amounts are stored in minor units, i.e. cents). */
  currency: text('currency').notNull().default('EUR'),
  /** Optional monthly grocery budget, in cents. */
  monthlyBudgetCents: integer('monthly_budget_cents'),
  /** JSON, see domain/settings.ts: default servings and which meals are planned on which days. */
  settings: text('settings').notNull().default('{}'),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  householdId: integer('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  createdAt: integer('created_at').notNull(),
});

/** One-time codes an owner hands out so someone can join the household. Only the hash is stored. */
export const invites = sqliteTable('invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
});

/** Browser sessions (cookie). The primary key is the SHA-256 of the cookie value. */
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});

/**
 * Bearer tokens accepted by the API and the MCP endpoint: OAuth access tokens
 * (clientId set) and personal access tokens (name set, usually no expiry).
 */
export const accessTokens = sqliteTable(
  'access_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tokenHash: text('token_hash').notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    name: text('name'),
    scopes: text('scopes').notNull().default(''),
    resource: text('resource'),
    expiresAt: integer('expires_at'),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
  },
  (t) => [index('access_tokens_user_idx').on(t.userId)],
);

export const refreshTokens = sqliteTable('refresh_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  accessTokenId: integer('access_token_id')
    .notNull()
    .references(() => accessTokens.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
});

// ---------------------------------------------------------------------------
// OAuth authorization server (used by MCP clients).
// ---------------------------------------------------------------------------

export const oauthClients = sqliteTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  /** JSON of the full client registration (redirect URIs, name, secret, ...). */
  data: text('data').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** An authorization request waiting for the user to log in and approve it. */
export const oauthRequests = sqliteTable('oauth_requests', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  state: text('state'),
  scopes: text('scopes').notNull().default(''),
  resource: text('resource'),
  expiresAt: integer('expires_at').notNull(),
});

export const authCodes = sqliteTable('auth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  scopes: text('scopes').notNull().default(''),
  resource: text('resource'),
  expiresAt: integer('expires_at').notNull(),
});

// ---------------------------------------------------------------------------
// Kitchen data. Every row carries its household; services always filter on it.
// ---------------------------------------------------------------------------

const household = () =>
  integer('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' });

/** Catalogue of ingredients/articles shared by stock, recipes and shopping. */
export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    name: text('name').notNull(),
    /** Lower-cased name used for case-insensitive lookups. */
    nameKey: text('name_key').notNull(),
    category: text('category'),
    // The DDL default is legacy and never used (the app always sets the unit, see DEFAULT_UNIT).
    // It is left as is: changing a SQLite default makes drizzle recreate the table, which would
    // cascade-delete every row that references it while foreign keys are on.
    defaultUnit: text('default_unit').notNull().default('pièce'),
    /** Alert threshold, expressed in defaultUnit. */
    minStock: real('min_stock'),
    /** Last known price in cents per 1 `priceUnit` (g, ml, piece, ...). Null until a price is recorded. */
    unitPrice: real('unit_price'),
    priceUnit: text('price_unit'),
    /** Always at home (oil, salt, pepper...): kept in recipes but never bought, counted or used up. */
    isStaple: integer('is_staple', { mode: 'boolean' }).notNull().default(false),
    /** Conversions that let g, ml and pieces be compared: 1 piece weighs this many grams... */
    gramsPerPiece: real('grams_per_piece'),
    /** ...and 1 ml weighs this many grams (density). */
    gramsPerMl: real('grams_per_ml'),
  },
  (t) => [uniqueIndex('products_household_name_idx').on(t.householdId, t.nameKey)],
);

/** Other names a product goes by, e.g. the wording on a receipt. Lower-cased and unique per household. */
export const productAliases = sqliteTable(
  'product_aliases',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    aliasKey: text('alias_key').notNull(),
  },
  (t) => [uniqueIndex('product_aliases_household_key_idx').on(t.householdId, t.aliasKey)],
);

export const stockItems = sqliteTable(
  'stock_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: real('quantity').notNull(),
    unit: text('unit').notNull(),
    location: text('location', { enum: LOCATIONS }).notNull().default('pantry'),
    /** ISO date YYYY-MM-DD. */
    expiresOn: text('expires_on'),
    addedOn: text('added_on').notNull(),
    /** "There is some, amount unknown" (plenty of pasta): counts as available, never used up by cooking. */
    approximate: integer('approximate', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('stock_household_idx').on(t.householdId)],
);

export const recipes = sqliteTable(
  'recipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    name: text('name').notNull(),
    description: text('description'),
    servings: integer('servings').notNull().default(4),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    instructions: text('instructions'),
    /** Household's own verdict, 1 to 5 stars (null = not rated yet). */
    rating: integer('rating'),
    favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('recipes_household_idx').on(t.householdId)],
);

/** Appliances (air fryer, oven) and utensils (whisk, mandoline) the household has, or a recipe asks for. */
export const equipment = sqliteTable(
  'equipment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    name: text('name').notNull(),
    /** Lower-cased name used for case-insensitive lookups. */
    nameKey: text('name_key').notNull(),
    kind: text('kind', { enum: ['appliance', 'utensil'] }).notNull().default('utensil'),
    /** False when a recipe mentions it but the household does not have it (yet). */
    owned: integer('owned', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('equipment_household_name_idx').on(t.householdId, t.nameKey)],
);

/** What a recipe needs besides ingredients. */
export const recipeEquipment = sqliteTable(
  'recipe_equipment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    equipmentId: integer('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('recipe_equipment_unique_idx').on(t.recipeId, t.equipmentId)],
);

/** Free-form labels such as "air fryer", "quick" or "no shopping". Lower-cased. */
export const recipeTags = sqliteTable(
  'recipe_tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => [uniqueIndex('recipe_tags_unique_idx').on(t.recipeId, t.tag)],
);

/** Ordered, structured steps: enough for a machine to start the right program (appliance, °C, minutes). */
export const recipeSteps = sqliteTable('recipe_steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  text: text('text').notNull(),
  durationMinutes: integer('duration_minutes'),
  temperatureC: integer('temperature_c'),
  appliance: text('appliance'),
});

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
  note: text('note'),
  /** "To taste" (pepper, thyme): listed in the recipe but not counted, bought or priced. */
  toTaste: integer('to_taste', { mode: 'boolean' }).notNull().default(false),
});

export const mealPlan = sqliteTable(
  'meal_plan',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    /** ISO date YYYY-MM-DD. */
    date: text('date').notNull(),
    mealType: text('meal_type', { enum: MEAL_TYPES }).notNull(),
    recipeId: integer('recipe_id').references(() => recipes.id, { onDelete: 'cascade' }),
    /** Free text for meals without a recipe (e.g. "Restaurant"). */
    title: text('title'),
    servings: integer('servings').notNull().default(4),
    cooked: integer('cooked', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('meal_plan_household_date_idx').on(t.householdId, t.date)],
);

/** Which planned meals a generated shopping line is for (a line can serve several meals). */
export const shoppingItemMeals = sqliteTable('shopping_item_meals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  shoppingItemId: integer('shopping_item_id')
    .notNull()
    .references(() => shoppingItems.id, { onDelete: 'cascade' }),
  mealId: integer('meal_id')
    .notNull()
    .references(() => mealPlan.id, { onDelete: 'cascade' }),
  /** Share of the line attributed to this meal, in the line's unit. */
  quantity: real('quantity'),
});

export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: real('quantity'),
    unit: text('unit').notNull(),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    /** 'manual' = added by a person/AI, 'plan' = generated from the meal plan. */
    source: text('source', { enum: ['manual', 'plan'] }).notNull().default('manual'),
    /** What this line cost (or is expected to cost), in cents. Entered while shopping. */
    priceCents: integer('price_cents'),
  },
  (t) => [index('shopping_household_idx').on(t.householdId)],
);

/** A purchase (a receipt or a manual entry). Totals are in cents. */
export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    householdId: household(),
    /** ISO date YYYY-MM-DD. */
    date: text('date').notNull(),
    store: text('store'),
    note: text('note'),
    totalCents: integer('total_cents').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('expenses_household_date_idx').on(t.householdId, t.date)],
);

export const expenseItems = sqliteTable('expense_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  expenseId: integer('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'cascade' }),
  /** Kept when the product is deleted, so history stays readable. */
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  /** Line total in cents. */
  priceCents: integer('price_cents').notNull(),
});
