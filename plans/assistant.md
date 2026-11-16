# Plan: a guided app for newcomers, with an optional local AI

Follows `plans/next-steps.md` (independent of it: nothing here waits for those items). Each item is one pull request from `main`, not stacked, unless the table says otherwise.

## Where we are

- A new user signs in and lands on **Planning** (`initialTab` in `web/src/App.tsx`), usually empty. The only guidance is the per-list empty states (`<Empty>`). There is no first-run path.
- The MCP server is the only "smart" part, and it needs an external assistant that the user installs and connects by hand. That is the main wall for a non-technical household.
- The server has no LLM client. It does already have what an assistant needs as input: `services/context.ts` (`context.get()`) gathers the household settings, season, stock about to expire, opened packs, low stock, open slots, upcoming and recent meals, favourites, never-made recipes, owned equipment and budget in one read. `recipes.suggest`, `planner.slots`, `planner.history`, `stock.alerts` and `shopping.completePurchase` / `generateFromPlan` exist and are reused as they are.
- Household settings are a JSON column (`services/settings.ts`, `domain/settings.ts`), so a new setting needs no migration.

## Goals

1. Someone who has never used the app knows what to do next at every moment, with **no AI configured**.
2. When an AI server is configured, the same screens get faster: it proposes, the person validates.
3. Nothing the AI produces is written without a human step, and nothing leaves the user's own machines.

## Principles

- **Deterministic first, AI as one more source of proposals.** Every guided flow works without a model (existing recipes ranked by stock and expiry, typed lines matched against the catalogue). The model replaces the ranking or the parsing step, not the screen.
- **The model never writes.** It returns data validated by zod. That data becomes a *proposal* that a person reviews line by line; the existing services do the writing.
- **The model never calls tools** and never fetches anything. It gets text in and returns JSON out, so there is no agent loop and a small local model is enough.
- **Reading must not write**: the next-actions service and the status endpoints are pure reads.
- The AI flows are UI-only: an MCP client is already an LLM and uses the existing tools. `get_next_actions` is the exception (see Open decisions).
- Same repository rules as ever: every query filters on the household id with a two-household test, text through `t()` with matching `fr.ts` keys, a generated migration for a schema change, tests with every item, README (en and fr), `.env.example` and `docker-compose.yml` updated with any variable.

## Items

| # | Item | Content | Size |
|---|---|---|---|
| 0 | Spike: local servers | Check against real versions of Ollama, LM Studio and llama.cpp what `GET /v1/models` returns, where vision is reported, whether JSON-schema output is honoured, and how the context window is set. Output: a short note in this file that replaces every "to verify" below. No product code. | S |
| 1 | Home and next actions | A deterministic `nextActions` service and a **Home** tab, the new default. See below. | M |
| 2 | Getting started | First-run checklist on Home, starter recipes, stock entered by aisle in a few taps. | M |
| 3 | Connect an assistant | A card with the MCP server URL for Claude and ChatGPT (OAuth, no token), shown only while the user has no connected client. | S |
| 4 | Plan the week (no AI) | The questionnaire and the review screen, fed by `recipes.suggest`. Establishes the proposal UI and the table behind it. | L |
| 5 | AI layer | `LLM_*` configuration, client, adapters, `/api/ai/status`, `/models`, `/test`, model choice in household settings, limits. | M |
| 6 | Shopping done, from text | "I did the shopping": free text to proposed stock lines, matched to the catalogue, reviewed, applied with `completePurchase`. | M |
| 7 | Plan the week, with AI | The model proposes recipes per open slot behind the screen from item 4. | M |
| 8 | Receipts | Digital PDF (text layer) first, then photo with a vision model. | M |
| 9 | Paste a recipe | Free text or URL-less paste to a structured recipe, reviewed in the existing editor. | S |
| 10 | Chat (optional) | A conversational panel on top of the above. Only if the guided flows leave a clear gap. | M |

### 1. Home and next actions

**Service** `services/nextActions.ts`, built on `context.get()` plus `shopping.list()`: pure reads, no AI, ranked cards, each with a type, a short reason, a target (a tab and a deep link such as `#planning`) and one primary action. Candidate cards, in priority order:

1. *Expiring soon*: lines that expire within 3 days, with the best recipe that uses them (`recipes.suggest` with `withinDays`, `products`). "2 yoghurts and spinach expire Thursday: make *Spinach gratin*."
2. *Open slots*: meals still unplanned in the next 7 days (`planner.slots`), with the guided planning button.
3. *Shopping list*: items to buy, or a list not completed since a shopping trip was expected.
4. *Planned meal to cook today*, with the ingredients check (`recipes.availability`).
5. *Low stock* and *opened packs* to finish (`stock.alerts`).
6. *Budget*: month spent against the budget when one is set (`budget.budgetStatus`).
7. *Getting started* (see item 2): replaces the list above while the household has no recipes, no stock and nothing planned, then shrinks to the steps still undone.

Rules: at most five cards, one per subject, nothing shown that has no action. A card can be dismissed for the day; this is a per-person convenience, stored in the browser (`localStorage`, with try/catch and a page that renders without it), not on the server.

**Web.** A `home` tab becomes the default (`TABS`, `NAV`, `initialTab`; `#home` deep links work, and an unknown hash still falls back to it). The **phone bar already has five entries**, so a sixth does not fit: see Open decisions. Each card links to the right tab, pre-filtered where it can be (`#recipes/12`).

**Tests.** Service: each card appears and disappears with its condition; ranking; an empty household returns only the getting-started card; two households never see each other's data. Web: the tab renders, cards navigate, dismiss survives a reload.

### 2. Getting started

- **Checklist**, ticked from real data, never by hand: add what you have at home, pick or add recipes, plan the week, generate the shopping list. Each step opens the right screen. The list disappears when complete.
- **Starter recipes**: a small set (about 20), written for the project and shipped as data in French and English, importable in one tap or one by one. They use staple and base-unit conventions already in the model.
- **Stock by aisle**: a screen of common products grouped by aisle (`produce`, `dairy`, `pantry`, and so on). Tap what is at home, optionally a rough quantity, validate in one write through the existing bulk path. Staples (oil, salt) are flagged as such.
- Empty states stop saying "nothing here" and say what to do and offer the button.

Tests: starter data validates against the recipe schema in both languages and has no duplicate names; the bulk write is one operation; two-household isolation; fr/en keys match.

### 3. Connect an assistant

For people who want an external assistant. The server is already an OAuth 2.1 authorization server for MCP clients (`auth/oauth.ts`, `/consent` page), so **no token is needed**: the client is given the URL, redirects the user to sign in and approve, and receives its own token.

- **What is shown**: the MCP URL (`PUBLIC_URL` + `/mcp`) with a copy button, for **Claude** and **ChatGPT** only, each with two or three lines saying where to paste it in that product. The exact menu names and the way each product accepts a custom connector change over time: write them from the vendors' current documentation when building, and keep them in `t()` so they are easy to update. Nothing is invented here.
- **Only while not connected**: the card is shown on Home (item 1) and under Account when the current user has no OAuth grant. "Connected" is read from `access_tokens` rows of that user with `clientId` set (OAuth, as opposed to personal tokens with `name` set) that are unexpired or have a live refresh token; `lastUsedAt` distinguishes "approved" from "actually used". Once connected the card turns into a small status line ("Claude connected, last used 2 days ago") with a revoke link to the existing token list. No new column.
- **Needs a public HTTPS address**: hosted assistants cannot reach `localhost`. When `PUBLIC_URL` is not a public `https` URL, the card says so instead of offering a URL that cannot work.
- **Per user, not per household**: each member connects their own client; the card follows the signed-in user.
- Personal tokens stay available under Account for clients that cannot do OAuth, but are no longer part of the guided path.

Tests: the card is absent once an OAuth token exists for the user and present after it is revoked or expired; a personal token does not count as connected; another household's or another user's tokens do not hide it; the localhost case shows the warning.

### 4. Plan the week (no AI)

The user flow, shared with item 7:

1. **Questionnaire**: a grid of days by meals (already-planned slots greyed out, `planner.slots`), preparation time per slot, ideas or wishes in free text, known recipes to reuse (checkboxes), "use what expires first" (on by default). Diet, equipment and budget come from the household, nothing to re-enter.
2. **Proposals**: one card per slot. Without AI, the candidate comes from `recipes.suggest` with the wishes turned into filters (tag, products, time).
3. **Review**, per card: **Accept** (plans the meal), **Edit** (opens the existing recipe editor, preloaded), **Refuse** (asks for another proposal for that slot, with an optional reason that is fed back as a constraint). Accept-all for the rest.
4. **Summary**: "Week planned, 12 items missing", with the button that calls `shopping.generateFromPlan`.

**This works without any AI server.** Nothing in this item calls a model. `recipes.suggest` already ranks the household's own recipes by what is in stock and about to expire, favourites, ratings, diet, equipment and recent history, and the proposal cards are filled from that. What it cannot do, so that nobody expects more:

- It **only picks existing recipes**. It cannot invent one. A household with no recipes has nothing to propose, which is why item 2 ships starter recipes and why importing or creating a few recipes is the first checklist step.
- The free-text "ideas" box is **not understood** without a model. Without AI that box is replaced by structured filters (tags such as quick or vegetarian, "must use these products", preparation time). With AI (item 7) the same box accepts a sentence.
- The AI adds exactly two things: **new recipes** that fit the wishes and the stock, and **understanding of free text**. Everything else on the screen is identical.

**Proposal storage.** A `proposals` table (id, household id, user id, kind, source `rules` or `llm`, status, JSON payload, created, expires) with a short TTL, so closing the tab does not lose the work and old proposals clean themselves up. It needs a generated migration. Applying a proposal **re-validates every id and quantity against the household at apply time**; the stored payload is never trusted. Apply is idempotent.

Tests: apply writes only what was accepted; a proposal of household A cannot be read or applied by household B; an expired proposal is refused; a refused slot yields a different recipe.

### 5. AI layer

**Configuration** (`server/src/config.ts`, `.env.example`, `docker-compose.yml`, both READMEs): `LLM_BASE_URL` (empty means the AI features are off), `LLM_API_KEY` (optional), `LLM_MODEL`, `LLM_VISION_MODEL` (optional defaults), `LLM_VISION` (`auto`, `true`, `false`), `LLM_TIMEOUT_MS`, `LLM_MAX_CONCURRENT`. The URL is set by whoever deploys the server and by nobody else, which closes the server-side request forgery door. The API key never reaches the browser.

**Client.** One OpenAI-compatible client (`/v1/chat/completions`, `/v1/models`), with timeouts, a concurrency cap (one job per household and a global cap: local inference is expensive), and a "JSON object plus zod validation, retry once" mode for models that do not honour a JSON schema.

**Capabilities by adapter chain**, each result `yes`, `no` or `unknown` (unknown is never treated as no, and `LLM_VISION=true` overrides it). *To verify in item 0*: Ollama `POST /api/show` capabilities, LM Studio `GET /api/v0/models`, llama.cpp `/props`; anything else is `unknown`. Also *to verify*: whether Ollama's OpenAI-compatible endpoint lets the request set the context size (some local servers truncate silently at a small default), and so whether the native endpoint is needed.

**Endpoints**, all behind the normal API auth, none cached by `web/public/sw.js`:
- `GET /api/ai/status`: `{ enabled, reachable, textModel, visionModel, capabilities }`. The UI reads only this.
- `GET /api/ai/models`: the models the server reports, with detected capabilities, short cache.
- `POST /api/ai/test`: reachable, model present, valid JSON back, image read if vision is claimed. Detailed failure goes to `req.log`; the client gets a generic message.

**Model choice** lives in household settings (`domain/settings.ts`), chosen from the listed models only, never typed. Who may change it is an Open decision.

**UI adaptation**: off or unreachable: AI buttons absent, the deterministic flows stay. Text only: free-text entry, no image upload. Text and vision: photo upload appears. A digital PDF needs no vision (item 8).

### 6. Shopping done, from text

Free text ("2 packs of milk, a chicken, 500 g tomatoes") becomes lines `{ name, quantity, unit, packs, price?, sourceText }`, unit forced to g, ml or piece. **Matching is done without the model**, in this order: barcode (the catalogue work on `feat/catalog-barcodes`), exact name or alias, a close match against the open shopping list (so a bought item is ticked), then *new product*. The review shows three states: recognised, to confirm (a menu of close products), unknown (create, link to an existing product, or ignore). Apply is one undoable operation: stock lines, `completePurchase`, and the expense with prices when given. Without AI the same screen takes one line per row and matches the same way.

Tests: parsing against a faked LLM server (valid, invalid JSON, slow, down); matching order; the receipt total versus the sum of lines shows a gap instead of passing silently; apply is atomic; isolation between households.

### 7. Plan the week, with AI

Behind the item 4 screen. One call per slot, not one big call: short outputs hold the schema better on small models, results stream in as they arrive, and a failure only costs one slot. The prompt carries `context.get()` (already built), the slot, the wishes and the recipes already proposed this run (to avoid repeats). The model returns a recipe as structured data; ingredient names go through the same catalogue matching as item 6 and unknown ones are flagged as new. Quantities and units are validated against the model's allowed units; anything else is rejected and retried. Accepted recipes are created (or linked to an existing one) at apply time only.

### 8. Receipts

1. **Digital PDF** (the usual case): extract the text layer on the server and send it as text. No vision, no OCR. If the extraction comes back empty, the PDF is a scan: say so and fall back to the image path below when a vision model is available.
2. **Photo**: resized in the browser before upload (size and weight capped), sent to the vision model. Abbreviated labels (`TOM CER 250G BIO`) and discount lines make this the hardest input, and the review step is what catches the errors.
3. A separate OCR step (a dependency in the Docker image) is only worth adding if vision models on real tickets turn out too weak; decide after item 0 and a few real receipts.

Images are processed in memory and **not stored** beyond the request. Upload size and content type are limited and checked.

### 9. Paste a recipe

Text pasted by the person becomes a structured recipe opened in the existing editor for review, nothing saved before the person confirms. No URL fetching (it would reintroduce server-side request forgery).

### 10. Chat (optional)

Only if gaps remain. If built, it keeps the same rule: it can draft proposals, never write.

## Threats and limits

- **Untrusted text reaches the model.** Receipt text, pasted recipes and free-text wishes can contain instructions. The design already treats model output as data: no tools, no fetching, output restricted to a zod schema, and a human review before any write. Prompts keep the instructions apart from the quoted input, and line counts and text lengths are capped.
- **Cost of local inference**: a concurrency cap, timeouts, and a rate limit on `/api/ai/*`, so one household cannot stall the machine.
- **Privacy**: everything stays between this server and the configured model server. Nothing is sent to a third party unless the person who deploys chooses a remote `LLM_BASE_URL`; the README says so plainly.
- **Authorisation**: `/api/ai/*` and proposals are household-scoped. Which of them Bearer (MCP) callers may use, and which are `sessionOnly`, is decided per route and tested in `server/src/auth/security.test.ts` (anonymous, member, other household, Bearer).
- **Hallucinated products and quantities**: nothing is trusted until matched and validated; unknown products need an explicit choice.
- **No model, or a bad one**: every flow has a deterministic path; a failed or invalid model answer degrades to it with a clear message, never to a silent failure.

## Order

Item 0 first and small: it replaces assumptions with facts before any AI code. Items 1 to 3 are the biggest gain for a newcomer and need no model; they can ship on their own. Item 4 builds the proposal screen and table with deterministic data, so items 6 and 7 only add a source. Item 5 can start in parallel with 4 once item 0 is done (no shared files). Then 6, 7, 8, 9 in that order, each independent of the next. Item 10 only if it is still wanted.

## Decisions

Taken:

- **Phone navigation.** Home becomes the first entry of the bottom bar and **Budget leaves it**. Budget is not folded into Home (the page holds expenses, prices and the budget itself, too much for a landing page): Home gets a *budget card* (month spent against the budget, a nudge when it is close or over) that opens the full page, and the page is also reachable from the account menu. Desktop keeps every tab in the top bar, Home included. The `NAV` list therefore differs by screen size: the phone bar is Home, Planning, Recipes, Shopping, Stock.
- **Model choice is per household**, stored in household settings, chosen from the models the server lists. Households have an `owner` / `member` role (`db/schema/accounts.ts`), so changing it is **owner-only and `sessionOnly`**; every member uses it. The server URL itself stays global in `.env`.
- **`get_next_actions` is an MCP tool** (read-only), so an assistant gets the same "what should we do now" entry as Home. The AI proposal flows stay UI-only.
- **Progress of a long generation** is polling a proposal's status. The live channel can replace it later if polling proves clumsy.
- **Card dismissal** is per browser (see item 1). A hidden card on Home means "not now for me", and the card comes back the next day; it is not a household setting.

Still open:

- **Receipt formats.** In practice most receipts come as **PDF** (shop app, drive, online order). That is the best case: item 8 starts with PDFs that carry a text layer, which need neither vision nor OCR. Two cases still need an image path, and the order of work depends on how common they are: a PDF that is only a scan or photo (no text layer, detected by an empty extraction), and paper receipts photographed with a phone. Decide the priority of the image path after trying a few real receipts.
