import { type ErrorRequestHandler, type Request, Router } from 'express';
import { z, ZodError } from 'zod';
import { type AccountService, loginInput, registerInput } from '../auth/accounts.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import { attachUser, clearSessionCookie, requireUser, sameOriginOnly, sessionTokenOf, setSessionCookie } from '../auth/http.js';
import type { OAuthProvider } from '../auth/oauth.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import {
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../domain/errors.js';
import * as s from '../domain/schemas.js';
import { createServices } from '../services/index.js';

interface Deps {
  db: Db;
  config: Config;
  accounts: AccountService;
  oauth: OAuthProvider;
}

const tokenName = z.object({ name: z.string().trim().min(1).max(80) });
const decision = z.object({ approve: z.boolean() });

/** REST adapter used by the web UI: accounts first, then the kitchen routes. */
export function createApiRouter({ db, config, accounts, oauth }: Deps) {
  const r = Router();
  const id = (params: unknown) => s.idParam.parse(params).id;
  /** Kitchen services bound to the caller's household. */
  const kitchen = (req: Request) => createServices(db, req.user!.householdId);

  const loginLimiter = createRateLimiter(10, 15 * 60_000);
  const registerLimiter = createRateLimiter(10, 60 * 60_000);

  r.use(sameOriginOnly, attachUser(accounts));

  // --- Accounts (public) ----------------------------------------------------

  const me = (req: Request) => ({
    user: req.user ?? null,
    registrationOpen: accounts.registrationOpen(),
  });

  r.get('/auth/me', (req, res) => void res.json(me(req)));

  r.post('/auth/register', async (req, res) => {
    registerLimiter.hit(req.ip ?? 'unknown');
    const user = await accounts.register(registerInput.parse(req.body));
    setSessionCookie(res, config, accounts.createSession(user.id));
    res.status(201).json({ user });
  });

  r.post('/auth/login', async (req, res) => {
    const input = loginInput.parse(req.body);
    const key = `${req.ip}|${input.email}`;
    loginLimiter.hit(key);
    const user = await accounts.login(input);
    loginLimiter.reset(key);
    setSessionCookie(res, config, accounts.createSession(user.id));
    res.json({ user });
  });

  r.post('/auth/logout', (req, res) => {
    const token = sessionTokenOf(req);
    if (token) accounts.destroySession(token);
    clearSessionCookie(res);
    res.status(204).end();
  });

  // --- Everything below needs a logged-in user ---------------------------------

  r.use(requireUser);

  r.get('/household', (req, res) => {
    const { householdId, householdName } = req.user!;
    res.json({ id: householdId, name: householdName, members: accounts.members(householdId) });
  });
  r.post('/household/invites', (req, res) => void res.status(201).json(accounts.createInvite(req.user!)));

  r.get('/tokens', (req, res) => void res.json(accounts.listTokens(req.user!.id)));
  r.post('/tokens', (req, res) => {
    const { name } = tokenName.parse(req.body);
    res.status(201).json(accounts.createPersonalToken(req.user!.id, name));
  });
  r.delete('/tokens/:id', (req, res) => {
    accounts.revokeToken(req.user!.id, id(req.params));
    res.status(204).end();
  });

  // Consent step of the OAuth flow for MCP clients (see auth/oauth.ts).
  r.get('/oauth/requests/:request', (req, res) => void res.json(oauth.describeRequest(String(req.params.request))));
  r.post('/oauth/requests/:request/decision', (req, res) => {
    const { approve } = decision.parse(req.body);
    res.json(oauth.decide(String(req.params.request), req.user!, approve));
  });

  // --- Kitchen ----------------------------------------------------------------

  r.get('/products', (req, res) => void res.json(kitchen(req).products.list()));
  r.patch('/products/:id', (req, res) =>
    void res.json(kitchen(req).products.update(s.productUpdate.parse({ ...req.body, id: id(req.params) }))),
  );

  r.get('/stock', (req, res) => void res.json(kitchen(req).stock.list(s.stockList.parse(req.query))));
  r.get('/stock/alerts', (req, res) => void res.json(kitchen(req).stock.alerts()));
  r.post('/stock', (req, res) => void res.status(201).json(kitchen(req).stock.add(s.stockAdd.parse(req.body))));
  r.post('/stock/consume', (req, res) => void res.json(kitchen(req).stock.consume(s.stockConsume.parse(req.body))));
  r.patch('/stock/:id', (req, res) =>
    void res.json(kitchen(req).stock.update(s.stockUpdate.parse({ ...req.body, id: id(req.params) }))),
  );
  r.delete('/stock/:id', (req, res) => {
    kitchen(req).stock.remove(id(req.params));
    res.status(204).end();
  });

  r.get('/recipes', (req, res) => void res.json(kitchen(req).recipes.list(s.recipeList.parse(req.query).search)));
  r.get('/recipes/:id', (req, res) => void res.json(kitchen(req).recipes.get(id(req.params))));
  r.get('/recipes/:id/availability', (req, res) =>
    void res.json(kitchen(req).recipes.availability(s.recipeAvailability.parse({ ...req.query, id: id(req.params) }))),
  );
  r.post('/recipes', (req, res) => void res.status(201).json(kitchen(req).recipes.create(s.recipeCreate.parse(req.body))));
  r.patch('/recipes/:id', (req, res) =>
    void res.json(kitchen(req).recipes.update(s.recipeUpdate.parse({ ...req.body, id: id(req.params) }))),
  );
  r.delete('/recipes/:id', (req, res) => {
    kitchen(req).recipes.remove(id(req.params));
    res.status(204).end();
  });

  r.get('/plan', (req, res) => void res.json(kitchen(req).planner.list(s.planList.parse(req.query))));
  r.post('/plan', (req, res) => void res.status(201).json(kitchen(req).planner.add(s.planAdd.parse(req.body))));
  r.post('/plan/:id/cook', (req, res) => void res.json(kitchen(req).planner.cook(id(req.params))));
  r.delete('/plan/:id', (req, res) => {
    kitchen(req).planner.remove(id(req.params));
    res.status(204).end();
  });

  r.get('/shopping', (req, res) => void res.json(kitchen(req).shopping.list()));
  r.post('/shopping', (req, res) => void res.status(201).json(kitchen(req).shopping.add(s.shoppingAdd.parse(req.body))));
  r.post('/shopping/generate', (req, res) =>
    void res.json(kitchen(req).shopping.generateFromPlan(s.shoppingGenerate.parse(req.body))),
  );
  r.post('/shopping/complete', (req, res) =>
    void res.json(kitchen(req).shopping.completePurchase(s.shoppingComplete.parse(req.body ?? {}).location)),
  );
  r.patch('/shopping/:id', (req, res) => {
    const { checked } = s.shoppingCheck.parse({ ...req.body, id: id(req.params) });
    res.json(kitchen(req).shopping.setChecked(id(req.params), checked));
  });
  r.delete('/shopping/:id', (req, res) => {
    kitchen(req).shopping.remove(id(req.params));
    res.status(204).end();
  });

  r.use((_req, res) => void res.status(404).json({ error: 'Not found' }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError)
      return void res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (err instanceof ValidationError) return void res.status(400).json({ error: err.message });
    if (err instanceof UnauthorizedError) return void res.status(401).json({ error: err.message });
    if (err instanceof ForbiddenError) return void res.status(403).json({ error: err.message });
    if (err instanceof NotFoundError) return void res.status(404).json({ error: err.message });
    if (err instanceof TooManyRequestsError) return void res.status(429).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  r.use(onError);

  return r;
}
