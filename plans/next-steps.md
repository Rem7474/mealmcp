# Plan: what is still missing

Follows `plans/stock-model.md` (phases 0 to 5, all merged). This lists what that work left open, in the order it is worth doing. Each item is one pull request from `main`, not stacked.

## Where we are

- The stock model now holds printed and effective dates, use-by / best-before, freezing, brand, barcode, a note per line and a price history per product.
- Never checked: `npm run test:coverage` for these phases, the new sheets, chips, menus and price history in a browser, the phone layout of the sign-in, Budget and Account pages, and migrations `0010` to `0014` on a copy of a populated database (only `0010` and `0014` have a data step).
- The SonarCloud gate stays red on duplication of `web/src/i18n/*.ts` (automatic analysis ignores `sonar-project.properties`).

## Principles

Same as the stock model plan: store inputs and compute the result, additive nullable columns only, one MCP tool and one UI entry per capability, every query filtered on the household id with a two-household test.

## Items

| # | Item | Content | Size |
|---|---|---|---|
| 1 | Verification debt | Run `npm run test:coverage` and raise the thresholds if coverage rose. Go through the new UI in a browser on desktop and phone width (add and edit sheets, expiry chips, freeze and thaw, unit prices, price history, sign-in, Budget, Account). Apply every migration to a copy of a real database and compare row counts and the backfills. Fix what shows up. | S |
| 2 | Quality gate | Exclude `web/src/i18n/*.ts` from duplication in SonarCloud (Administration, Analysis Scope), or move to a CI-driven scan with `SONAR_TOKEN` so `sonar-project.properties` applies. Decide, then make the gate green. | S |
| 3 | Bought frozen (done) | `add_stock` with `location: freezer` sets `frozenOn` and the freezing clock, so a line added from a freezer shelf does not keep a printed date it no longer follows. The shopping completion does the same when it is put away in the freezer. | S |
| 4 | Price paid per line (done) | Column `stock_items.paidUnitPrice` (cents per base unit, so it survives splits and use), filled by `complete_shopping` and `record_expense` with `addToStock`, carried on split, open and merge (part of the merge key). Waste is valued at the price paid, then at the latest product price. Both fall back as today. | M |
| 5 | Price follow-up in the UI (done; the `get_stock_alerts` question stays open) | Show the trend on the Budget prices card, a gentle flag on shopping rows when the latest price is well above the average, and the cheapest shop in the product sheet. Free-form units (can, pack) stay unconverted: say so instead of showing nothing. | S |
| 6 | Partial freezing (done) | Freeze a quantity of a line (a part of the pack bought): the line is split, the frozen part gets `frozenOn`, the rest keeps its date. `freeze_stock_item` takes an optional quantity. | M |
| 7a | Product catalogue: barcodes, lookup, fill (server, REST, MCP) | **Model**: a household product is a concept ("Pasta"); a barcode is one physical item that maps to it, and a product can have many. New additive table `product_barcodes` (householdId, productId, code normalised to GTIN-13/14, brand, packSize, unit, label), unique on (householdId, code), modelled on `product_aliases`; a data step moves the existing `products.barcode` values into it and the old column stays read-only (deprecated). Brand moves to the barcode row. **One Open Food Facts adapter** (`services/catalog.ts`: URLs, fields, timeout, generic User-Agent without contact details, a rate limit, graceful failure) returning a `CatalogHit` (name, generic name, brand, pack size, nutrition when any, localised to the household language with `product_name_<lang>`); `search_nutrition` and `setProduct({code})` are rebuilt on it. **Pack size**: numeric OFF fields first (`product_quantity` and its unit), then a pure parser in `domain/` for the text ("1,5 kg", "75 cl", "500 g ℮", "6 x 125 g" = 6 of 125, "4 tranches" = none) with table tests. **Routes**: `GET /catalog/products/:code` and `GET /catalog/search?q=` (up to 8 candidates), both read-only, working with the nutrition module off and without nutrition values. **MCP**: `search_catalog` taking a `code` or a `name` (named apart from the household `get_product` of item 9). **Flow** (separate async steps, `stock.add` stays synchronous and free of network calls): code known locally = a line is added to that product with no network call; code unknown = catalogue lookup, then the existing product that matches the name, generic name or alias is proposed; a new product is created only when the user or assistant says so. `add_stock` takes `barcode` (with an optional `name` to attach it to that product); there is no `fromProduct`. The product name and the generic name become aliases of the product the code is attached to (conflicts skipped). A name alone never adds anything. New schemas in their own file (`domain/schemas/catalog.ts`), not in `schemas.ts`. Tests: two-household isolation on `product_barcodes`; an outbound-request test showing only the code or the searched text leaves the server. | L |
| 7b | Barcode: scan in the PWA | Consumes the `CatalogHit` of 7a only. Camera scan with the `BarcodeDetector` API and a typed code where it is missing. The add sheet opens prefilled: name (editable, with the matching existing product proposed), pack size and unit, number of packs with - and + buttons (1 by default, giving "3 x 500 g"), brand, barcode. A known code is recognised without a lookup. Missing or free-text quantities ("4 slices") leave the field empty. No answer from the catalogue: typed entry as today. | M |
| 8 | Split `domain/schemas.ts` (done) | One file per domain in `domain/schemas/` (named like the MCP tool files), re-exported by `schemas.ts` so imports keep working. No behaviour change, done on its own so the diff stays reviewable. | M |
| 9 | MCP in few calls | Done: stock tools (update, open, unopen, freeze) and `get_price_history` accept a product name in place of an id, `update_product` takes `product` (a name), and `update_stock_bulk` and `update_products_bulk` change many lines or products in one call. `get_product` (and `GET /products/:id`) reads a product sheet in one call: settings, stock lines and total, price history (with the `high` flag), waste and the recipes that use it. `freeze_stock_item` also thaws (`action: thaw`), replacing `thaw_stock_item`. A price well above the average stays out of `get_stock_alerts` (decided 2026-11-25: not a stock alert; `get_product` shows it). Still to do: count the calls of each everyday scenario (shopping done, what to cook tonight, tidy the freezer) to find the next gap. | S |

## Order

Items 1 and 2 first: they check what was merged and clear the red gate. Item 3 is small and removes a wrong clock. Items 4 and 5 finish price tracking; 4 needs a migration, 5 does not. Item 6 is done. Item 7 is two pull requests, in this order: 7a (server, API, MCP, tests) then 7b (UI on top of 7a). Item 8 is best done when no other change is in flight on `schemas.ts`. Item 9 can run at any point and feeds the list.

## Barcode: decisions taken

- A product is a concept with many barcodes (table `product_barcodes`), so scanning never multiplies household products. The scan proposes an existing product before creating one.
- The product name and the generic name become aliases of the product the code is attached to, automatically; the catalogue gives no real synonyms, so aliases stay editable by hand.
- Pack sizes are per stock line already (merge key includes it), so a product can be bought in several formats; each barcode row carries its own pack size, so the codes of a product are its known formats. The size saved on our row wins over the catalogue's when the catalogue is wrong. 7b offers those formats as shortcuts in the add sheet. A product without a barcode (loose vegetables) stays a manual entry.
- Lookups (by code or by name) work with the nutrition module off. Routes live under `/catalog`, since a name is not a barcode.
- Folding sections (accordions, "more options") stay for secondary settings only; the scan flow shows its few fields in plain view.

## Open decisions

- Whether the gate stays on Sonar's automatic analysis (simplest, needs the UI setting) or moves to a CI scan (a secret, but exclusions live in the repository).
- Whether a price well above the average should only show on screen or also appear in `get_stock_alerts` for the MCP client.
