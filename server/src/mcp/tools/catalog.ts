import { ValidationError } from '../../domain/errors.js';
import * as c from '../../domain/schemas/catalog.js';
import type { ToolContext } from './context.js';

export function registerCatalogTools({ catalog, tool, ro }: ToolContext) {
  // --- Product catalogue (Open Food Facts) -------------------------------------
  tool(
    'search_catalog',
    'Look a packaged product up in the Open Food Facts catalogue, by barcode (code) or by name (name, up to 8 candidates). Gives the name, generic name, brand, pack size and, when there are any, nutrition values per 100 g, plus what this household already has for it: known (the product a code is already tied to) and suggestions (your products that go by that name). Nothing is saved: to stock an item, call add_stock with its barcode. Works whether or not the nutrition module is on. Only the code or the searched text is sent to Open Food Facts.',
    c.catalogLookup.shape,
    ro,
    async ({ code, name, lang }) => {
      if (code && name) throw new ValidationError('Give either a barcode or a name, not both');
      if (code) return catalog.product(code, lang);
      if (name) return catalog.search(name, lang);
      throw new ValidationError('Give a barcode (code) or a product name (name)');
    },
  );
}
