# Contributing

```bash
npm ci
npm run dev        # server and web with reload
npm run lint       # Biome: lint + formatting (npm run format fixes it)
npm run typecheck
npm test           # server and web (npm run test:coverage checks the thresholds)
```

- Node version: see `.node-version`.
- Keep changes small; add a test with every fix or feature.
- Server messages shown to users must exist in `web/src/i18n/en.ts` and `fr.ts` (a test checks both match).
- A database change needs a migration: `npm run db:generate -w server`.
- Releases: `npm run release -- patch|minor|major` bumps versions, commits and tags; push with `git push --follow-tags`.
