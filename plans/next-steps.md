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
| 7 | Barcode scanning | Camera scan in the PWA (the `BarcodeDetector` API, with a typed fallback where it is missing) that fills `products.barcode` and offers the nutrition lookup. Only the code leaves the server, as today. | M |
| 8 | Split `domain/schemas.ts` | One file per domain next to the MCP tool files, re-exported so imports keep working. No behaviour change, done on its own so the diff stays reviewable. | M |
| 9 | MCP in few calls | Done in the first step: stock tools (update, open, unopen, freeze, thaw) and `get_price_history` accept a product name in place of an id, `update_product` takes `product` (a name), and `update_stock_bulk` and `update_products_bulk` change many lines or products in one call. Still to do: a `get_product` sheet (settings, stock, price, history in one read), merging `freeze_stock_item` and `thaw_stock_item` to keep the tool list short, and counting the calls of each everyday scenario (shopping done, what to cook tonight, tidy the freezer) to find the next gap. Same for the REST API if the web app needs it. | S |

## Order

Items 1 and 2 first: they check what was merged and clear the red gate. Item 3 is small and removes a wrong clock. Items 4 and 5 finish price tracking; 4 needs a migration, 5 does not. Items 6 and 7 are independent. Item 8 is best done when no other change is in flight on `schemas.ts`. Item 9 can run at any point and feeds the list.

## Open decisions

- Whether the gate stays on Sonar's automatic analysis (simplest, needs the UI setting) or moves to a CI scan (a secret, but exclusions live in the repository).
- Whether a price well above the average should only show on screen or also appear in `get_stock_alerts` for the MCP client.
