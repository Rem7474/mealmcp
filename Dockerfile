FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
WORKDIR /app
# better-sqlite3 is compiled from source when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
# Lifecycle scripts stay off; only the native SQLite binding is built.
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/mealmcp.db
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/drizzle server/drizzle
COPY --from=build /app/web/dist web/dist
# The app only needs `node`. npm and corepack (bundled in the base image) are never used at runtime,
# and their own dependencies are a recurring source of image scan findings.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
# Node is already here: no curl needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server/dist/index.js"]
