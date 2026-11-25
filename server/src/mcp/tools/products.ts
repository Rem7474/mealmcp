import * as s from '../../domain/schemas.js';
import type { ToolContext } from './context.js';

export function registerProductsTools({ products, productSheet, tool, ro, rw }: ToolContext) {
  // --- Products ------------------------------------------------------------
  tool('list_products', 'List all known products with their category, default unit and minimum stock threshold.', {}, ro, () =>
    products.list(),
  );
  tool(
    'get_product',
    'Everything about one product in a single read (its id from list_products, or its name or an alias): its settings (category, unit, threshold, staple, conversions, shelf lives, allergens, aliases, barcodes), the stock lines and total at home, the price history (latest, average, trend, cheapest shop, high when the latest price is well above the average), what was thrown away and the recipes that use it. Read it before changing or advising on a product instead of calling list_stock, get_price_history and get_waste_summary.',
    s.productRefParam.shape,
    ro,
    (a) => productSheet.get(products.idOf(a)),
  );
  tool(
    'update_product',
    'Change a product, given by id or by name in `product` (then `name` renames it): rename it, set its category (aisle: produce, dairy, meat_fish, bakery, pantry, frozen, drinks, household, other), low-stock threshold, staple flag, conversions (gramsPerPiece, gramsPerMl), allergens it contains (explicit list, overrides the name-based guess), drained weight (beans: net 200 g, drained 125 g) the days it keeps once opened (openedShelfLifeDays), in the freezer (frozenShelfLifeDays) or once thawed (thawedShelfLifeDays), its brand or its barcode.',
    s.productUpdateByRef.shape,
    rw,
    ({ product, id, ...patch }) => products.update({ ...patch, id: products.idOf({ id, name: product }) }),
  );
  tool(
    'update_products_bulk',
    'Change several products in one call (all or nothing): each item is a product id or name (in `product`) plus the fields of update_product. Use it to set shelf lives, thresholds, categories or conversions for many products at once.',
    s.productUpdateMany.shape,
    rw,
    (a) => products.updateMany(a.items),
  );
}
