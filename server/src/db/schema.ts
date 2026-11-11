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
    defaultUnit: text('default_unit').notNull().default('pièce'),
    /** Alert threshold, expressed in defaultUnit. */
    minStock: real('min_stock'),
  },
  (t) => [uniqueIndex('products_household_name_idx').on(t.householdId, t.nameKey)],
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
    instructions: text('instructions'),
  },
  (t) => [index('recipes_household_idx').on(t.householdId)],
);

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
  },
  (t) => [index('shopping_household_idx').on(t.householdId)],
);
