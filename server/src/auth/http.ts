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

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = safeDecode(part.slice(i + 1).trim());
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

export const clearSessionCookie = (res: Response) => void res.clearCookie(SESSION_COOKIE, { path: '/' });

export const sessionTokenOf = (req: Request) => parseCookies(req.headers.cookie)[SESSION_COOKIE];

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
 * Defence in depth on top of SameSite=Lax cookies: a state-changing request
 * from a browser must come from the same host as the page it targets.
 */
export const sameOriginOnly: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      /* invalid origin: rejected below */
    }
    if (host !== req.host) throw new ForbiddenError('Cross-origin request refused');
  }
  next();
};
