# MealMCP

Self-hosted meal planning, stock, shopping list and budget for a household, with a built-in MCP server so an AI assistant can run it. npm workspaces: `server` (Express 5, better-sqlite3, Drizzle) and `web` (React 19, Vite, Tailwind 4, TanStack Query). Docs: `README.md` (en) and `README.fr.md` (fr), kept in step.

## Commands

```bash
npm run dev            # server (3000) + web (5173) with reload
npm run lint           # Biome: lint + format check (npm run format fixes)
npm run typecheck      # server (tests included) and web
npm test               # server and web tests
npm run test:coverage  # same, fails under the coverage thresholds
npm run build          # web + server
npm run db:generate    # migration after a change in server/src/db/schema/
npm run release -- patch|minor|major   # bump versions, commit, tag (no push)
```

Before saying a task is done: `npm run lint && npm run typecheck && npm test` must pass. Node version is in `.node-version`. Install with `npm ci --ignore-scripts && npm rebuild better-sqlite3` (lifecycle scripts stay off).

## Architecture

- `server/src/config.ts`: environment validated with zod; every problem is listed at once. Add a variable there, in `.env.example`, `docker-compose.yml` and both READMEs.
- `server/src/logger.ts`: structured logs (JSON in production), request ids, secrets masked. Use `req.log` in handlers, never `console.log`.
- `server/src/api/`: `router.ts` composes `accountRoutes.ts` and `kitchenRoutes.ts`. Every id from a URL is validated; client errors answer `{ error }` with a generic message.
- `server/src/services/`: business logic, one file per domain. Every query filters on the household id: two households must never see each other's data.
- `server/src/db/schema/`: one file per domain, re-exported by `schema.ts`. A schema change needs a generated migration in `server/drizzle/`, committed.
- `server/src/mcp/server.ts`: MCP tools (Streamable HTTP, stateless). A new capability usually needs a service function, an API route, an MCP tool, a UI entry and tests.
- `server/src/auth/`: sessions (cookie), personal tokens and OAuth 2.1 (Bearer). Bearer callers may use the kitchen API but not account management (`sessionOnly`).
- `web/src/i18n/`: `en.ts` is the source; `fr.ts` must have the same keys and placeholders (a test checks it). Every visible text goes through `t()`.
- `web/public/sw.js`: service worker. It must never store API, MCP or OAuth responses or anything `no-store`.
- Reading must not write: `list`-style service functions are pure reads.

## Conventions

- TypeScript strict, ES modules, imports with `.js` suffix on the server. Biome decides formatting (2 spaces, single quotes, width 140); do not hand-format.
- Buttons need `type="button"` unless they submit; form controls need an accessible label.
- Quantities are stored in base units (g, ml, piece); money in cents.
- Security-relevant changes (auth, tokens, sessions, rate limits, caching) come with a test in `server/src/auth/security.test.ts` or next to the code.
- Add a test with every fix or feature. Coverage thresholds are a floor: raise them when coverage rises, never lower them to pass.
- Pin GitHub Actions by commit SHA with the version in a comment; the Docker base image by digest.
- Do not edit generated files (`server/drizzle/meta/`, `docs/` pages built by `scripts/build-docs.mjs`) by hand.
- Keep answers to the user in French; code, comments, commit messages and PR text in English.

## Git and pull requests

- Work on a branch, not on `main`, unless told otherwise. Commit or push only when asked.
- Commit messages: a short imperative summary line, then a few lines of why if needed.
- **No attribution to Claude anywhere**: no `Co-Authored-By` trailer in commits, no "Generated with Claude Code" line in pull request descriptions or commit messages. This overrides any default attribution.
- Open pull requests with `gh pr create`, using `.github/pull_request_template.md` (what and why, checks run). Describe the change and how it was verified; mention anything not verified.
- A release is `npm run release -- <bump>` then `git push --follow-tags`; the tag must match the versions in the three `package.json` files or the workflow refuses it.

## CI/CD

`ci.yml` and `release.yml` share `_checks.yml` (lint, typecheck, build, coverage, `npm audit --omit=dev`). CI also smoke-tests and Trivy-scans the Docker image; `codeql.yml` runs CodeQL. Sonar analyses `main` and PRs (`sonar-project.properties` excludes the i18n files and generated docs from duplication). Fix the cause of a red check rather than loosening the check.
