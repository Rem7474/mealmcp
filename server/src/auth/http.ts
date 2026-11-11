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
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
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

/** Reads who is calling: a personal/OAuth bearer token, or the browser session cookie. */
export function attachUser(accounts: AccountService): RequestHandler {
  return (req, _res, next) => {
    const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) {
      const identity = accounts.verifyToken(bearer);
      if (identity) req.user = accounts.getUser(identity.userId);
    } else {
      const session = sessionTokenOf(req);
      if (session) req.user = accounts.userForSession(session) ?? undefined;
    }
    next();
  };
}

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
