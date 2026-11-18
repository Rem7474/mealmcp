import type { Request, RequestHandler, Response } from 'express';
import type { Config } from '../config.js';
import { isSecure } from '../config.js';
import { ForbiddenError, UnauthorizedError } from '../domain/errors.js';
import { type AccountService, type CurrentUser, SESSION_TTL } from './accounts.js';

export const SESSION_COOKIE = 'mealmcp_session';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `attachUser` when the request carries a valid session cookie or bearer token. */
    user?: CurrentUser;
    /** How the caller proved who they are: the browser cookie, or a personal/OAuth bearer token. */
    authVia?: 'session' | 'bearer';
  }
}

/** A malformed %-sequence in a cookie must not turn into a server error. */
const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of header?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i > 0) out.set(part.slice(0, i).trim(), safeDecode(part.slice(i + 1).trim()));
  }
  return out;
}

export function setSessionCookie(res: Response, config: Config, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(config),
    maxAge: SESSION_TTL,
    path: '/',
  });
}

export const clearSessionCookie = (res: Response, config: Config) =>
  void res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(config),
    path: '/',
  });

export const sessionTokenOf = (req: Request) => parseCookies(req.headers.cookie).get(SESSION_COOKIE);

/** One cookie of the request, by name. */
export const cookieOf = (req: Request, name: string) => parseCookies(req.headers.cookie).get(name);

/** Binds an OAuth authorization request to the browser that started it (see auth/oauth.ts). */
export const OAUTH_COOKIE = 'mealmcp_oauth';
export function setOauthCookie(res: Response, config: Config, requestId: string) {
  res.cookie(OAUTH_COOKIE, requestId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(config),
    maxAge: 10 * 60_000,
    path: '/',
  });
}

/** The token of an `Authorization: Bearer <token>` header (plain string handling, no backtracking regex). */
const bearerOf = (header: string | undefined) => {
  const space = header?.indexOf(' ') ?? -1;
  if (!header || space < 0 || header.slice(0, space).toLowerCase() !== 'bearer') return undefined;
  return header.slice(space + 1).trim() || undefined;
};

/** Reads who is calling: a personal/OAuth bearer token, or the browser session cookie. */
export function attachUser(accounts: AccountService): RequestHandler {
  return (req, _res, next) => {
    const bearer = bearerOf(req.headers.authorization);
    if (bearer) {
      const identity = accounts.verifyToken(bearer);
      if (identity) {
        req.user = accounts.getUser(identity.userId);
        req.authVia = 'bearer';
      }
    } else {
      const session = sessionTokenOf(req);
      const user = session ? accounts.userForSession(session) : null;
      if (user) {
        req.user = user;
        req.authVia = 'session';
      }
    }
    next();
  };
}

/**
 * Account management (tokens, invitations, password, devices, deleting the account) is for a person in a
 * browser. A bearer token, personal or issued to an AI client through OAuth, can work on the kitchen but
 * can never mint new tokens or invitations, or take the account over.
 */
export const sessionOnly: RequestHandler = (req, _res, next) => {
  if (req.authVia !== 'session') throw new ForbiddenError('This action needs a signed-in browser session, not an access token');
  next();
};

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  next();
};

/**
 * Defence in depth on top of SameSite=Lax cookies: a state-changing request from a browser must come from the
 * page's own origin (scheme included). Browsers that say `Sec-Fetch-Site: cross-site` or `same-site` (a sibling
 * subdomain) are refused too, even when the Origin header is missing.
 */
export const sameOriginOnly = (config: Config): RequestHandler => {
  const own = config.publicUrl.origin;
  return (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const site = req.headers['sec-fetch-site'];
      if (site === 'cross-site' || site === 'same-site') throw new ForbiddenError('Cross-origin request refused');
      const origin = req.headers.origin;
      if (origin) {
        let host = '';
        let protocol = '';
        try {
          ({ host, protocol } = new URL(origin));
        } catch {
          /* invalid origin: rejected below */
        }
        // Behind a TLS proxy the app sees http: the host must match, and the scheme must match what is published.
        if (host !== req.host || (protocol !== req.protocol && protocol !== new URL(own).protocol))
          throw new ForbiddenError('Cross-origin request refused');
      }
    }
    next();
  };
};
