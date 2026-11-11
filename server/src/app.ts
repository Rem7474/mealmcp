import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { createApiRouter } from './api/router.js';
import { createAccountService } from './auth/accounts.js';
import { OAuthProvider, SCOPES } from './auth/oauth.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { createMcpServer } from './mcp/server.js';
import { createHub } from './realtime.js';
import { createServices } from './services/index.js';

const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createApp(db: Db, config: Config) {
  const accounts = createAccountService(db, config);
  const oauth = new OAuthProvider(db, config, accounts);
  const hub = createHub();
  const mcpUrl = new URL('/mcp', config.publicUrl);

  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    // The consent screen must never be framed (clickjacking), and nothing needs third-party content.
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    );
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => void res.json({ status: 'ok' }));

  // OAuth 2.1 for MCP clients: discovery metadata, /authorize, /token, /register (dynamic), /revoke.
  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: config.publicUrl,
      resourceServerUrl: mcpUrl,
      resourceName: 'MealMCP',
      scopesSupported: SCOPES,
    }),
  );

  app.use('/api', createApiRouter({ db, config, accounts, oauth, hub }));

  // MCP over stateless Streamable HTTP: a fresh server per request, bound to the caller's household.
  const bearer = requireBearerAuth({ verifier: oauth, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });
  app.post('/mcp', bearer, async (req, res) => {
    const { householdId } = req.auth!.extra as { householdId: number };
    const server = createMcpServer(createServices(db, householdId), () => hub.publish(householdId));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all('/mcp', bearer, (_req, res) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  });

  // Built web UI, with fallback to index.html for client-side pages such as /consent.
  if (existsSync(webDist)) {
    // The service worker must always be revalidated so updates reach installed copies.
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDist, 'sw.js'));
    });
    app.use(express.static(webDist));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(join(webDist, 'index.html')) : next()));
  }

  return app;
}
