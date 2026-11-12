import { type ErrorRequestHandler, Router } from 'express';
import { ZodError } from 'zod';
import type { AccountService } from '../auth/accounts.js';
import { attachUser, requireUser, sameOriginOnly } from '../auth/http.js';
import type { OAuthProvider } from '../auth/oauth.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { ForbiddenError, NotFoundError, TooManyRequestsError, UnauthorizedError, ValidationError } from '../domain/errors.js';
import type { Hub } from '../realtime.js';
import { createAccountRoutes, createPublicAuthRoutes } from './accountRoutes.js';
import { createKitchenRoutes } from './kitchenRoutes.js';

interface Deps {
  db: Db;
  config: Config;
  accounts: AccountService;
  oauth: OAuthProvider;
  hub: Hub;
}

/** REST adapter used by the web UI: accounts first, then the kitchen routes. */
export function createApiRouter({ db, config, accounts, oauth, hub }: Deps) {
  const r = Router();

  // Nothing the API answers (a session, a household, a stock list) may be kept by a browser or a proxy:
  // after signing out on a shared device, the back button must not bring the data back.
  r.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  r.use(sameOriginOnly, attachUser(accounts));

  r.use(createPublicAuthRoutes({ config, accounts }));

  // --- Everything below needs a logged-in user ---------------------------------
  r.use(requireUser);

  // Any successful write wakes the open dashboards of the household (see realtime.ts).
  r.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD')
      res.on('finish', () => {
        if (res.statusCode < 400) hub.publish(req.user!.householdId);
      });
    next();
  });

  r.get('/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(': connected\n\n');
    const unsubscribe = hub.subscribe(req.user!.householdId, res);
    // Comment lines keep the connection alive through proxies that close idle streams.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  r.use(createAccountRoutes({ accounts, oauth }));
  r.use(createKitchenRoutes(db));

  r.use((_req, res) => void res.status(404).json({ error: 'Not found' }));

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError)
      return void res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (err instanceof ValidationError) return void res.status(400).json({ error: err.message });
    if (err instanceof UnauthorizedError) return void res.status(401).json({ error: err.message });
    if (err instanceof ForbiddenError) return void res.status(403).json({ error: err.message });
    if (err instanceof NotFoundError) return void res.status(404).json({ error: err.message });
    if (err instanceof TooManyRequestsError) return void res.status(429).json({ error: err.message });
    // Malformed JSON and oversized bodies are the caller's mistake, not ours.
    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 500) return void res.status(status).json({ error: 'Invalid request' });
    (req.log ?? console).error('unhandled error', { err });
    res.status(500).json({ error: 'Internal server error' });
  };
  r.use(onError);

  return r;
}
