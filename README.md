# MealMCP

**English** · [Français](README.fr.md) · [Website](https://rem7474.github.io/mealmcp/)

[![CI](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Rem7474/mealmcp/actions/workflows/ci.yml)

Decide what to eat, buy only what you need, use what is already in the fridge and keep the grocery budget in check. One app you host yourself, that Claude or any AI assistant can run for you through its built-in MCP server.

- **Plan the week in minutes**: put a recipe or a quick note on each day. Say who eats and when, and empty slots stand out. "Plan my week" proposes a menu from your stock, what expires and your tastes; you keep, swap or pick each meal before it is added. With an AI server connected, "Plan with AI" does the same with new recipes written for you (and optional wishes); they are only saved when you add them.
- **Shopping lists that write themselves**: the week's meals become a list (what you need, minus what is at home, plus what is running low). View it by aisle, or by the meal each item is for, and put the purchases away in one go. Back from the shop, type or paste what you bought ("I did my shopping"): you check the lines, then stock, list and expense are updated at once. With an AI server connected, it also understands whole sentences. It also reads a receipt, as a PDF or a photo (the file is read and not kept). With an AI server, Home also offers a small chat about your stock, recipes and plan: it only answers and points to the right screen, it changes nothing.
- **Know what is in the fridge**: fridge, freezer and pantry with expiry dates, alerts on opened jars, use-by and best-before dates, freezing and thawing, even just part of a pack (the clock changes with them), a note and brand per line, barcodes (several per product, one per format; scan one with the phone camera or type it and the add form fills itself in, or an assistant can look one up in Open Food Facts and stock it in one call, only the code or the searched name is sent), packs kept as `3 × 200 ml`, drained weights for beans and tuna, and per-product conversions (1 sweet potato = 300 g). It suggests recipes that use up what expires first.
- **Recipes that fit your kitchen**: ingredients (staples and "to taste" items are never bought), steps with appliance and temperature, tags, 1–5 star ratings and favorites. See which ones you can cook right now, and which need an appliance you do not own.
- **Grocery budget under control**: log purchases (by hand, from a receipt via an AI, or when you finish shopping), set a monthly budget with a projection, see spending by category, shop and month, and get cost estimates for recipes, the week and the list from what you really paid. Every receipt feeds a price history per product (per kg, litre or piece, trend, cheapest shop), shopping lines are flagged when a price is well above the usual one, and each stock line remembers what you paid for it. Any currency.
- **Calories and macros, only if you want them** (off by default): turn it on in the household settings to see calories, protein, carbs and fat for every recipe. Values come from [Open Food Facts](https://world.openfoodfacts.org) when you look a product up (only the product name or barcode is sent; data under ODbL) or from numbers you type, and the totals tell you which ingredients had none.
- **Eat in season**: a bundled offline calendar of fruit, vegetables and herbs for your country (FR, BE, CH, GB, CA, US, southern hemisphere supported). Out-of-season items on your list come with in-season alternatives.
- **Diets and allergies, handled**: vegetarian, gluten-free, the 14 EU allergens, foods someone dislikes. Recipes that do not fit are flagged and never suggested (matching is by ingredient name: a safety net, check labels).
- **Less waste, less repetition**: see when each recipe was last made so menus stay fresh, and log what you throw away to see what it costs, valued at the price you paid.
- **Made for AI planning**: `get_meal_context` gives an assistant everything it needs to propose a menu in one call (constraints, expiring stock, season, recent meals, open slots, budget).
- **One household, everyone in sync**: invite the family, and every screen refreshes by itself when something changes elsewhere, including when your AI edits the stock.
- **On your phone**: install it from the browser and use it one-handed in the shop; forms open as sheets you can swipe down to close (needs HTTPS, see below).
- **Bilingual**: English and French (language switcher at the top right, browser language by default). MCP tool descriptions are in English.

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
| `npm test` | server tests (services, auth, OAuth, security, config) and web tests (components, i18n, service worker) |
| `npm run test:coverage` | same, and fails if coverage falls under the thresholds |
| `npm run lint` | Biome: lint and formatting (`npm run format` fixes what it can) |
| `npm run typecheck` | TypeScript on server (tests included) and web |
| `npm run release -- patch` | bump the version everywhere, commit and tag (push with `git push --follow-tags`) |
| `npm run build` | build web + server |
| `npm start` | serve the built app on port 3000 |
| `npm run db:generate` | generate a migration after changing `server/src/db/schema.ts` |

To add a UI language, add a file next to `web/src/i18n/fr.ts` (it must define every key of `en.ts`) and register it in `web/src/i18n/index.tsx`.

## CI/CD

- `_checks.yml` (reusable, shared by CI and releases): Biome lint/format, typecheck, build, tests with coverage thresholds, and `npm audit` on production dependencies.
- `ci.yml`: those checks on every push and pull request, then builds the Docker image, smoke-tests the container (health check, access refused without an account, OAuth discovery, `no-store` on the API, JSON logs without secrets, clean shutdown on SIGTERM) and scans it with Trivy.
- `codeql.yml`: CodeQL static analysis on pushes, pull requests and weekly.
- `release.yml`: after the same checks, publishes the multi-arch image to GitHub Container Registry with an SBOM, build provenance and a cosign signature. For a `vX.Y.Z` tag it first checks that the tag matches the version in the `package.json` files, then creates a GitHub Release. To release: `npm run release -- minor && git push --follow-tags`.
- Dependabot updates npm dependencies, GitHub Actions and the base image. Actions and the base image are pinned by digest.

Verify a published image:

```bash
cosign verify ghcr.io/rem7474/mealmcp:0.4.5 \
  --certificate-identity-regexp '^https://github.com/Rem7474/mealmcp/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Docker deployment

Copy `.env.example` to `.env` and set at least `PUBLIC_URL` (the real address of the app, over HTTPS if remote MCP clients must reach it), then:

```bash
docker compose up -d
```

This pulls the published image (`ghcr.io/rem7474/mealmcp:latest`). To pin a version, add `MEALMCP_VERSION=0.1.0` to `.env`; to build from source, use `docker compose up -d --build`.

Then open the app: **the first account created becomes the household owner**.

The image (amd64 and arm64) is published on every push to `main` (tag `main`) and every `vX.Y.Z` tag (tags `X.Y.Z`, `X.Y` and `latest`).

The SQLite database lives in the `mealmcp-data` volume. If the app is exposed beyond your local network, put it behind an HTTPS reverse proxy and set `PUBLIC_URL` and `TRUST_PROXY` (see `.env.example`).

The configuration is checked at startup: a wrong value (`PORT=abc`, `PUBLIC_URL` without `https://`...) stops the app with every problem listed. Logs go to stdout, one JSON object per line in production (`LOG_FORMAT=json`), with a request id (`X-Request-Id`) and secrets masked; `LOG_LEVEL` is `debug`, `info`, `warn`, `error` or `silent`. The container has a health check on `/health` and stops cleanly on `SIGTERM`.

**Backups**: copy the database while the app runs with `docker compose exec mealmcp node -e "require('better-sqlite3')('/data/mealmcp.db').backup('/data/backup.db').then(()=>console.log('ok'))"` and fetch `/data/backup.db` from the volume.

## Optional local AI

MealMCP works fully without AI. If you run a model server on your own machines (Ollama, LM Studio, llama.cpp: anything that speaks the OpenAI API), set `LLM_BASE_URL` (for example `http://localhost:11434/v1`) and the app can use it for guided flows. The model only **proposes**: a person reviews and validates before anything is written, and it never calls tools or fetches anything. Everything stays between this app and your model server.

- `LLM_BASE_URL` empty means the AI features are off. It is set by whoever deploys the server and cannot be changed from the app. Inside Docker, `localhost` is the container: use `http://host.docker.internal:11434/v1` for a server on the host.
- `LLM_API_KEY` (optional) is sent as a bearer token and never reaches the browser or the logs. `LLM_MODEL` and `LLM_VISION_MODEL` are defaults; the household owner picks the models in **Account > AI assistant**, from the list the server reports.
- `LLM_VISION` is `auto` (use what the server reports for a model: Ollama, LM Studio and llama.cpp are recognised, anything else is `unknown`), `true` or `false`. `LLM_TIMEOUT_MS` and `LLM_MAX_CONCURRENT` bound the load: one request at a time per household, `LLM_MAX_CONCURRENT` in all.
- A **Test** button in the same screen checks that the server answers, the model exists, it returns valid JSON and, when it reads images, accepts one.

## Accounts and households

- A **household** groups recipes, meal plan, shopping list and stock. Every row belongs to a household and the services always filter on it, so two households never see each other's data.
- The first account creates a household and owns it. The owner then invites others (**Account** tab) with a single-use code valid for 7 days. `ALLOW_REGISTRATION=true` also lets strangers create their own households.
- Passwords are hashed with scrypt, sessions use `HttpOnly`/`SameSite=Lax` cookies, tokens and codes are stored hashed, and login attempts are rate-limited per IP and per email. Signing up never reveals whether an email is already used.
- In the **Account** tab you can change your password (other devices are signed out), see the devices signed in and sign any of them out, remove a household member (owner), delete your account (the household too when you are alone in it), and create personal tokens with an optional expiry date.
- **No password reset by email**: the app does not send mail. If someone forgets their password, delete their user row from the database and have them sign up again.

## Connecting an AI (MCP)

Endpoint: `POST /mcp` (Streamable HTTP transport, stateless). It always acts on the signed-in person's household.

**OAuth 2.1 (recommended)**: the server is its own authorization server (discovery metadata, dynamic client registration, PKCE S256, one-hour access tokens and refresh tokens rotated on every use). A compatible client such as Claude only needs the address `PUBLIC_URL/mcp`: it opens the sign-in page, you allow access, done. Granted access can be revoked from the **Account** tab. Note that OAuth discovery requires `PUBLIC_URL` to be HTTPS (or `localhost`).

**Personal token**: for scripts or clients without OAuth, create a token in the **Account** tab, then for example with Claude Code:

```bash
claude mcp add --transport http mealmcp http://localhost:3000/mcp --header "Authorization: Bearer mmcp_YOUR_TOKEN"
```

The same token (or an OAuth access token) works on the REST API (`/api`) for everything in the kitchen, but cannot manage the account (password, devices, tokens, invitations, members): that needs the browser session. To try the OAuth flow locally, use the built app (`npm run build && npm start`) rather than `npm run dev`.

Money: amounts you send are decimals in the household currency (`2.49`), amounts you receive are integers in cents (`249`). Writes made through MCP (or the API) are pushed to open dashboards over Server-Sent Events (`GET /api/events`), so there is nothing to refresh.

Tools: stock (`list_stock`, `add_stock`, `add_stock_bulk`, `update_stock_item`, `update_stock_bulk`, `open_stock_item`, `unopen_stock_item`, `freeze_stock_item`, `thaw_stock_item`, `consume_stock`, `discard_stock`, `remove_stock_item`, `get_stock_alerts`, `get_waste_summary`), recipes (`list_recipes`, `get_recipe`, `create_recipe`, `create_recipes_bulk`, `update_recipe`, `delete_recipe`, `check_recipe_availability`, `suggest_recipes_to_use_up`), meal plan (`list_meal_plan`, `plan_meal`, `plan_meals_bulk`, `remove_planned_meal`, `cook_planned_meal`, `list_planning_slots`, `get_meal_history`, `get_meal_context`, `get_next_actions`), shopping (`list_shopping_list`, `generate_shopping_list`, `add_shopping_item`, `add_shopping_items_bulk`, `check_shopping_item`, `remove_shopping_item`, `complete_shopping`, `parse_purchase_text`, `apply_purchase`), budget and prices (`record_expense`, `list_expenses`, `get_expense`, `delete_expense`, `get_spending_summary`, `get_budget_status`, `set_budget`, `set_product_price`, `get_price_history`, `get_price_overview`, `estimate_recipe_cost`, `estimate_meal_plan_cost`, `estimate_shopping_list_cost`), nutrition (optional) (`search_nutrition`, `set_product_nutrition`, `autofill_recipe_nutrition`, `get_recipe_nutrition`, `get_meal_plan_nutrition`), products, equipment, household and season (`list_products`, `search_catalog`, `update_product`, `update_products_bulk`, `add_product_alias`, `remove_product_alias`, `list_equipment`, `add_equipment`, `update_equipment`, `remove_equipment`, `get_household_settings`, `set_household_settings`, `get_seasonal_produce`).

## License

[MIT](LICENSE)
