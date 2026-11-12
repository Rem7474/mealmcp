import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  role: text('role', { enum: ['owner', 'member'] })
    .notNull()
    .default('member'),
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
  /** Shown in the list of signed-in devices (epoch ms; 0 for sessions created before this was recorded). */
  createdAt: integer('created_at').notNull().default(0),
  lastSeenAt: integer('last_seen_at').notNull().default(0),
  /** Browser identification, cut short, so people can recognise their own devices. */
  userAgent: text('user_agent'),
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
