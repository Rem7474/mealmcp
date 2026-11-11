# MealMCP

**English** · [Français](README.fr.md) · [Website](https://rem7474.github.io/mealmcp/)

[![CI](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml)

Meal planning, shopping and pantry stock for a household, with a built-in MCP server so an AI assistant can drive it.

- **Planning**: meals per day, from a recipe or free text. Household settings (people eating, which meals on which weekdays) highlight the empty slots to fill.
- **Recipes**: ingredients (staples and "to taste" items are never bought), servings, prep and cook time, tags (air fryer, quick, no shopping), structured steps (appliance, temperature, duration), the equipment they need, and availability against your stock. Rate them (1–5 stars) and mark favorites: suggestions favour what you love.
- **Equipment**: the appliances and utensils you own. Recipes needing something you do not have are flagged.
- **Shopping**: a list generated from the meal plan (needs − stock + products below their threshold), manual additions, and putting purchases away into stock. View it as a flat list, by store aisle, or by the meal each item is for.
- **Stock**: by location (fridge, freezer, pantry), expiry dates, low-stock alerts, "plenty of it" quantities, per-product conversions (1 sweet potato = 300 g, 1 tbsp = 15 ml) and aliases (receipt wording). Packs are kept as `3 × 200 ml`, opened packs get an opening date, a shelf life and an alert, and drained weights (beans, tuna) are compared to recipes correctly. Recipes can be suggested to use up what expires soon.
- **Budget**: record purchases (by hand, from a receipt via an AI, or when you finish shopping), a monthly budget with a projection, spending by category / shop / month, and cost estimates for recipes, the week's meals and the shopping list, from the prices of what you bought.
- **Live dashboard**: the web UI refreshes by itself when something changes elsewhere, for example when an AI edits your stock through MCP.
- **Installable (PWA)**: add it to your phone's home screen for a full-screen app (needs HTTPS, see below).
- **Bilingual**: English and French UI (language switcher at the top right, browser language by default). MCP tool descriptions are in English.

## Architecture

```
server/src
  db/         Drizzle schema + SQLite, migrations applied at startup
  domain/     Zod input schemas, units, dates, errors
  auth/       accounts, sessions, households, OAuth server for MCP
  services/   all the business logic (bound to one household)
  api/        REST adapter (used by the web UI)
  mcp/        MCP adapter (used by AI clients)
web/src       React + Vite + Tailwind UI (messages in web/src/i18n)
```

The REST API and the MCP server are two thin adapters over the same services: a business rule is written once, in `services/`.

Quantities are stored in a base unit (g, ml, "piece"); kg, l and cl are converted on input.

## Development

```bash
npm install
npm run dev
```

UI on http://localhost:5173, backend on http://localhost:3000.

| Command | Effect |
| --- | --- |
| `npm test` | service and auth/OAuth tests |
| `npm run build` | build web + server |
| `npm start` | serve the built app on port 3000 |
| `npm run db:generate` | generate a migration after changing `server/src/db/schema.ts` |

To add a UI language, add a file next to `web/src/i18n/fr.ts` (it must define every key of `en.ts`) and register it in `web/src/i18n/index.tsx`.

## CI/CD

- `ci.yml`: on every push and pull request, build (type-checks web + server), tests, then builds the Docker image and smoke-tests the container (access refused without an account, OAuth discovery, account creation).
- `release.yml`: after the tests, publishes the image to GitHub Container Registry; for a `vX.Y.Z` tag it also creates a GitHub Release. To release: `git tag -a v0.2.0 -m v0.2.0 && git push origin v0.2.0`.
- Dependabot updates npm dependencies, GitHub Actions and the base image.

## Docker deployment

Copy `.env.example` to `.env` and set at least `PUBLIC_URL` (the real address of the app, over HTTPS if remote MCP clients must reach it), then:

```bash
docker compose up -d
```

This pulls the published image (`ghcr.io/rem7474/mealmcp:latest`). To pin a version, add `MEALMCP_VERSION=0.1.0` to `.env`; to build from source, use `docker compose up -d --build`.

Then open the app: **the first account created becomes the household owner**.

The image (amd64 and arm64) is published on every push to `main` (tag `main`) and every `vX.Y.Z` tag (tags `X.Y.Z`, `X.Y` and `latest`).

The SQLite database lives in the `mealmcp-data` volume. If the app is exposed beyond your local network, put it behind an HTTPS reverse proxy and set `PUBLIC_URL` and `TRUST_PROXY` (see `.env.example`).

## Accounts and households

- A **household** groups recipes, meal plan, shopping list and stock. Every row belongs to a household and the services always filter on it, so two households never see each other's data.
- The first account creates a household and owns it. The owner then invites others (**Account** tab) with a single-use code valid for 7 days. `ALLOW_REGISTRATION=true` also lets strangers create their own households.
- Passwords are hashed with scrypt, sessions use `HttpOnly`/`SameSite=Lax` cookies, tokens and codes are stored hashed, and login attempts are rate-limited.
- **No password reset by email**: the app does not send mail. If someone forgets their password, delete their user row from the database and have them sign up again.

## Connecting an AI (MCP)

Endpoint: `POST /mcp` (Streamable HTTP transport, stateless). It always acts on the signed-in person's household.

**OAuth 2.1 (recommended)**: the server is its own authorization server (discovery metadata, dynamic client registration, PKCE S256, one-hour access tokens and refresh tokens rotated on every use). A compatible client such as Claude only needs the address `PUBLIC_URL/mcp`: it opens the sign-in page, you allow access, done. Granted access can be revoked from the **Account** tab. Note that OAuth discovery requires `PUBLIC_URL` to be HTTPS (or `localhost`).

**Personal token**: for scripts or clients without OAuth, create a token in the **Account** tab, then for example with Claude Code:

```bash
claude mcp add --transport http mealmcp http://localhost:3000/mcp --header "Authorization: Bearer mmcp_YOUR_TOKEN"
```

The same token works on the REST API (`/api`). To try the OAuth flow locally, use the built app (`npm run build && npm start`) rather than `npm run dev`.

Money: amounts you send are decimals in the household currency (`2.49`), amounts you receive are integers in cents (`249`). Writes made through MCP (or the API) are pushed to open dashboards over Server-Sent Events (`GET /api/events`), so there is nothing to refresh.

Tools: stock (`list_stock`, `add_stock`, `update_stock_item`, `consume_stock`, `remove_stock_item`, `get_stock_alerts`), products (`list_products`, `update_product`, `add_product_alias`, `remove_product_alias`), recipes (`list_recipes`, `get_recipe`, `create_recipe`, `update_recipe`, `delete_recipe`, `check_recipe_availability`, `suggest_recipes_to_use_up`), equipment (`list_equipment`, `add_equipment`, `update_equipment`, `remove_equipment`), meal plan (`list_meal_plan`, `plan_meal`, `remove_planned_meal`, `cook_planned_meal`, `list_planning_slots`), shopping (`list_shopping_list`, `add_shopping_item`, `check_shopping_item`, `remove_shopping_item`, `generate_shopping_list`, `complete_shopping`), household (`get_household_settings`, `set_household_settings`), bulk variants (`add_stock_bulk`, `create_recipes_bulk`, `plan_meals_bulk`, `add_shopping_items_bulk`), budget (`record_expense`, `list_expenses`, `get_expense`, `delete_expense`, `get_spending_summary`, `get_budget_status`, `set_budget`, `set_product_price`, `estimate_recipe_cost`, `estimate_meal_plan_cost`, `estimate_shopping_list_cost`).

## License

[MIT](LICENSE)
