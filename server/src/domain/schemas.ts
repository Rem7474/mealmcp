/**
 * Input schemas shared by the REST API and the MCP tools, one file per domain in `schemas/`.
 * The `.describe()` texts are what an AI client sees for each parameter.
 * This file re-exports them all, so `import * as s from './schemas.js'` keeps working.
 */
export * from './schemas/ai.js';
export * from './schemas/budget.js';
export * from './schemas/catalog.js';
export { EQUIPMENT_KINDS, equipmentAdd, equipmentUpdate } from './schemas/equipment.js';
export * from './schemas/insights.js';
export * from './schemas/nutrition.js';
export * from './schemas/planning.js';
export * from './schemas/products.js';
export * from './schemas/recipes.js';
export * from './schemas/settings.js';
export { idParam } from './schemas/shared.js';
export * from './schemas/shopping.js';
export * from './schemas/stock.js';
