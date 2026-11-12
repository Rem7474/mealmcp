import { type Request, Router } from 'express';
import { z } from 'zod';
import { type AccountService, accountDeleteInput, loginInput, passwordChangeInput, registerInput, tokenInput } from '../auth/accounts.js';
import { clearSessionCookie, sessionOnly, sessionTokenOf, setSessionCookie } from '../auth/http.js';
import type { OAuthProvider } from '../auth/oauth.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import type { Config } from '../config.js';
import { UnauthorizedError } from '../domain/errors.js';
import * as s from '../domain/schemas.js';

interface Deps {
  config: Config;
  accounts: AccountService;
  oauth: OAuthProvider;
}

const decision = z.object({ approve: z.boolean() });
const handle = (params: unknown) => z.object({ handle: z.string().min(1).max(64) }).parse(params).handle;

/**
 * Sign-up and sign-in. Failed logins are limited on two axes at once: per address (guessing one
 * account's password from many places) and per email (trying many accounts from one place).
 */
export function createPublicAuthRoutes({ config, accounts }: Pick<Deps, 'config' | 'accounts'>) {
  const r = Router();
  const registerByIp = createRateLimiter(10, 60 * 60_000);
  const failuresByIp = createRateLimiter(30, 15 * 60_000);
  const failuresByEmail = createRateLimiter(10, 15 * 60_000);
  const ipOf = (req: Request) => req.ip ?? 'unknown';

  r.get('/auth/me', (req, res) => void res.json({ user: req.user ?? null, registrationOpen: accounts.registrationOpen() }));

  r.post('/auth/register', async (req, res) => {
    registerByIp.hit(ipOf(req));
    const user = await accounts.register(registerInput.parse(req.body));
    req.log?.info('account created', { userId: user.id });
    setSessionCookie(res, config, accounts.createSession(user.id, req.get('user-agent')));
    res.status(201).json({ user });
  });

  r.post('/auth/login', async (req, res) => {
    const input = loginInput.parse(req.body);
    const ip = ipOf(req);
    failuresByIp.check(ip);
    failuresByEmail.check(input.email);
    let user: ReturnType<typeof accounts.getUser>;
    try {
      user = await accounts.login(input);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        failuresByIp.record(ip);
        failuresByEmail.record(input.email);
        req.log?.warn('login failed', { ip });
      }
      throw err;
    }
    failuresByEmail.reset(input.email);
    req.log?.info('login', { userId: user.id });
    setSessionCookie(res, config, accounts.createSession(user.id, req.get('user-agent')));
    res.json({ user });
  });

  r.post('/auth/logout', (req, res) => {
    const token = sessionTokenOf(req);
    if (token) accounts.destroySession(token);
    clearSessionCookie(res);
    res.status(204).end();
  });

  return r;
}

/** Account management for a signed-in person: household, devices, tokens, password, consent. Browser sessions only. */
export function createAccountRoutes({ accounts, oauth }: Pick<Deps, 'accounts' | 'oauth'>) {
  const r = Router();
  // Password checks are a guessing oracle for anyone holding a stolen session: keep them slow.
  const reauth = createRateLimiter(5, 15 * 60_000);

  r.get('/household', (req, res) => {
    const { householdId, householdName } = req.user!;
    res.json({ id: householdId, name: householdName, members: accounts.members(householdId) });
  });

  // Everything below is for browser sessions only (see sessionOnly). It is applied per route because
  // this router is mounted at the root: a router-wide guard would also catch the kitchen routes.

  r.post('/household/invites', sessionOnly, (req, res) => void res.status(201).json(accounts.createInvite(req.user!)));
  r.delete('/household/members/:id', sessionOnly, (req, res) => {
    accounts.removeMember(req.user!, s.idParam.parse(req.params).id);
    req.log?.info('member removed', { by: req.user!.id, member: req.params.id });
    res.status(204).end();
  });

  r.get('/tokens', sessionOnly, (req, res) => void res.json(accounts.listTokens(req.user!.id)));
  r.post('/tokens', sessionOnly, (req, res) => {
    const { name, expiresInDays } = tokenInput.parse(req.body);
    res.status(201).json(accounts.createPersonalToken(req.user!.id, name, expiresInDays));
  });
  r.delete('/tokens/:id', sessionOnly, (req, res) => {
    accounts.revokeToken(req.user!.id, s.idParam.parse(req.params).id);
    res.status(204).end();
  });

  // Devices signed in with a cookie.
  r.get('/auth/sessions', sessionOnly, (req, res) => void res.json(accounts.listSessions(req.user!.id, sessionTokenOf(req))));
  r.post('/auth/sessions/revoke-others', sessionOnly, (req, res) => {
    accounts.revokeOtherSessions(req.user!.id, sessionTokenOf(req)!);
    res.status(204).end();
  });
  r.delete('/auth/sessions/:handle', sessionOnly, (req, res) => {
    accounts.revokeSession(req.user!.id, handle(req.params));
    res.status(204).end();
  });

  r.post('/auth/password', sessionOnly, async (req, res) => {
    const input = passwordChangeInput.parse(req.body);
    const key = String(req.user!.id);
    reauth.check(key);
    try {
      await accounts.changePassword(req.user!.id, input, sessionTokenOf(req));
    } catch (err) {
      if (err instanceof UnauthorizedError) reauth.record(key);
      throw err;
    }
    reauth.reset(key);
    req.log?.info('password changed', { userId: req.user!.id });
    res.status(204).end();
  });

  r.delete('/auth/account', sessionOnly, async (req, res) => {
    const { password } = accountDeleteInput.parse(req.body);
    const key = String(req.user!.id);
    reauth.check(key);
    try {
      await accounts.deleteAccount(req.user!, password);
    } catch (err) {
      if (err instanceof UnauthorizedError) reauth.record(key);
      throw err;
    }
    req.log?.info('account deleted', { userId: req.user!.id });
    clearSessionCookie(res);
    res.status(204).end();
  });

  // Consent step of the OAuth flow for MCP clients (see auth/oauth.ts).
  r.get('/oauth/requests/:request', sessionOnly, (req, res) => void res.json(oauth.describeRequest(String(req.params.request))));
  r.post('/oauth/requests/:request/decision', sessionOnly, (req, res) => {
    const { approve } = decision.parse(req.body);
    const result = oauth.decide(String(req.params.request), req.user!, approve);
    req.log?.info(approve ? 'oauth grant approved' : 'oauth grant denied', { userId: req.user!.id });
    res.json(result);
  });

  return r;
}
