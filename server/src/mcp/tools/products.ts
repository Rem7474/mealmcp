import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerProductsTools({ products, tool, ro, rw }: ToolContext) {
  // --- Products ------------------------------------------------------------
  tool('list_products', 'List all known products with their category, default unit and minimum stock threshold.', {}, ro, () =>
    products.list(),
  );
  tool(
    'update_product',
    'Rename a product, set its category (aisle: produce, dairy, meat_fish, bakery, pantry, frozen, drinks, household, other), low-stock threshold, staple flag, conversions (gramsPerPiece, gramsPerMl), allergens it contains (explicit list, overrides the name-based guess), drained weight (beans: net 200 g, drained 125 g) the days it keeps once opened (openedShelfLifeDays), in the freezer (frozenShelfLifeDays) or once thawed (thawedShelfLifeDays), its brand or its barcode.',
    s.productUpdate.shape,
    rw,
    (a) => products.update(a),
  );
}
