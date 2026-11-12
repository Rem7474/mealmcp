// The database schema, split by area under ./schema. This file keeps the single import point
// (`../db/schema.js`) used across the server and by drizzle-kit.

export * from './schema/accounts.js';
export * from './schema/budget.js';
export * from './schema/common.js';
export * from './schema/pantry.js';
export * from './schema/planning.js';
export * from './schema/recipes.js';
