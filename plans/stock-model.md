# Plan: completing the stock model

Status: phases 0 and 1 done (printed date kept, opening date editable). Splitting `domain/schemas.ts` is left for the first phase that adds many fields. Each phase is one pull request, stacked on the previous one.

## Where we are

- `stock_items` is a wide table and its logic lives in `services/stock.ts`. The pipes around it are single files too: `mcp/server.ts` and `domain/schemas.ts`. A new attribute touches six places: schema, migration, service, validation, MCP tool and UI.
- `expiresOn` holds two different things, the printed date and the effective one. Opening a pack overwrites the printed date (`openedExpiry`), so the opening date cannot be corrected later: the starting point is lost.
- Merging lines ("same product, unit, pack size, place and expiry: grow the existing line") ignores any new attribute, so a frozen or use-by line could be merged with another by mistake.

## Principles

1. **Store inputs, compute the result.** The table keeps facts (printed date, opened on, frozen on, thawed on). The effective `expiresOn` stays stored so queries stay simple, but one module recomputes it whenever an input changes.
2. **A pure rules module.** `services/shelfLife.ts` exposes `effectiveExpiry(line, product, today)` with no database access. Each rule (opening, freezing, thawing) is an entry in a list: adding one does not touch the others. It is tested without a database.
3. **Additive, nullable columns only.** Never change a SQLite default or recreate a table: with foreign keys on, that cascade-deletes the rows that reference it (see the note in `db/schema/pantry.ts`).
4. **One MCP tool and one UI field per capability.** Parameters added to existing tools are optional, so connected clients keep working.

## Phases

| # | Phase | Content | Size |
|---|---|---|---|
| 0 | Preparation, no behaviour change | Extract `shelfLife.ts` from `openedExpiry`. Split `mcp/server.ts` into `mcp/tools/*` and `schemas.ts` by domain. Characterisation tests on stock before touching anything. | M |
| 1 | Printed date and editable opening date | Column `printedExpiresOn`. `stockUpdate` accepts `openedOn` (opened lines only) and recomputes the effective date. Backfill `printedExpiresOn` from `expiresOn` for existing unopened lines. UI: field in the edit sheet. | M |
| 2 | Use-by / best-before | Column `dateKind` (`use_by`, `best_before`, null = unspecified, treated as best-before). A passed use-by date means "throw away", a passed best-before date means "check". Touches stock alerts, use-it-up suggestions, the waste reason and the UI chips. | M |
| 3 | Frozen / thawed | Columns `frozenOn`, `thawedOn`; per-product `frozenShelfLifeDays` and `thawedShelfLifeDays`, with defaults per category in a data file. Moving to the freezer freezes. New MCP tools `freeze_stock_item` and `thaw_stock_item`; warn before refreezing. | L |
| 4 | Price paid per line | Column `priceCents`, filled by `complete_shopping` and manual entry. Waste valuation uses the line price first, then the product price. Later option: a `price_observations` table (product, price, date, store). | M |
| 5 | Brand, notes, barcode | `products.brand`, `products.barcode` (linked to the existing nutrition lookup), `stock_items.note`. Camera scanning would come later, in the PWA. | S |

## Checklist for every phase

- Add the new attributes to the line merge key (phases 1 to 3).
- Reading must not write: `list` stays pure, recomputation happens on write.
- Every new query filters on the household id, with a test that two households do not see each other's data.
- Update `en.ts` and `fr.ts` together, both READMEs and the MCP tool descriptions.
- Generate the migration with `npm run db:generate` and commit it; never edit `drizzle/meta/`.
- Release a minor version after phases 1 to 3, since the MCP surface grows.

## Order and dependencies

Phase 0 first. Phases 1 and 2 together are the most useful increment (editable opening date, use-by / best-before). Phase 3 depends on phase 1 (the printed date must be kept). Phases 4 and 5 are independent of each other.

## Open decisions

- Existing lines without a date kind: default to best-before (less alarming) or leave unspecified with no effect?
- Default freezing durations: a small per-category file (meat, vegetables, bread...), overridable per product.
