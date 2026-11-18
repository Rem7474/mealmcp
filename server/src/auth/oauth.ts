import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { accessTokens, authCodes, oauthClients, oauthRequests, refreshTokens } from '../db/schema.js';
import { NotFoundError } from '../domain/errors.js';
import type { AccountService, CurrentUser } from './accounts.js';
import { randomToken, sha256 } from './crypto.js';
import { setOauthCookie } from './http.js';

export const SCOPES = ['mealmcp'];
const ACCESS_TTL = 60 * 60 * 1000;
const REFRESH_TTL = 30 * 86_400_000;
const REQUEST_TTL = 10 * 60 * 1000;
const CODE_TTL = 5 * 60 * 1000;
/** requireBearerAuth insists on an expiry; personal tokens report year 2100. */
const NEVER = 4_102_444_800;

/** https, loopback http (native apps) and app-specific schemes are fine; script-like schemes are not. */
function validRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'].includes(url.protocol)) return false;
  if (url.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return !url.hash;
}

/**
 * OAuth 2.1 authorization server for MCP clients (the SDK provides the HTTP
 * endpoints; this class provides storage and policy). The login and consent
 * screens live in the web UI: `authorize` parks the request and sends the
 * browser to /consent, and `decide` (called by that page) issues the code.
 */
export class OAuthProvider implements OAuthServerProvider {
  constructor(
    private db: Db,
    private config: Config,
    private accounts: AccountService,
  ) {}

  clientsStore: OAuthRegisteredClientsStore = {
    getClient: (clientId) => {
      const row = this.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
      return row ? (JSON.parse(row.data) as OAuthClientInformationFull) : undefined;
    },
    registerClient: (client) => {
      const full = client as OAuthClientInformationFull;
      if (!full.redirect_uris?.length || !full.redirect_uris.every((u) => validRedirectUri(String(u))))
        throw new InvalidClientMetadataError('redirect_uris must be https, http on localhost, or an app-specific scheme');
      // Drop old dynamic registrations that were never used or whose tokens are gone.
      const cutoff = Date.now() - 86_400_000;
      this.db
        .delete(oauthClients)
        .where(
          and(
            lt(oauthClients.createdAt, cutoff),
            sql`not exists (select 1 from access_tokens t where t.client_id = ${oauthClients.clientId})`,
            sql`not exists (select 1 from oauth_requests r where r.client_id = ${oauthClients.clientId})`,
          ),
        )
        .run();
      this.db
        .insert(oauthClients)
        .values({ clientId: full.client_id, data: JSON.stringify(full), createdAt: Date.now() })
        .run();
      return full;
    },
  };

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const requested = params.scopes ?? [];
    if (requested.some((s) => !SCOPES.includes(s))) throw new InvalidRequestError('Unknown scope requested');
    // A resource indicator (RFC 8707) must name this server, not another one the token could be replayed on.
    if (params.resource && params.resource.origin !== this.config.publicUrl.origin) throw new InvalidRequestError('Unknown resource');
    const now = Date.now();
    this.db.delete(oauthRequests).where(lt(oauthRequests.expiresAt, now)).run();
    this.db.delete(authCodes).where(lt(authCodes.expiresAt, now)).run();
    const id = randomToken(24);
    this.db
      .insert(oauthRequests)
      .values({
        id,
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state ?? null,
        scopes: SCOPES.join(' '),
        resource: params.resource?.href ?? null,
        expiresAt: now + REQUEST_TTL,
      })
      .run();
    // The browser that started the request is the only one that may approve it: the consent link alone is not enough.
    setOauthCookie(res, this.config, id);
    res.redirect(302, new URL(`/consent?request=${id}`, this.config.publicUrl).href);
  }

  // --- Consent step, driven by the web UI ---------------------------------

  private pending(id: string, boundTo: string | undefined) {
    if (boundTo !== id) throw new NotFoundError('Authorization request', 'expired or unknown');
    const row = this.db.select().from(oauthRequests).where(eq(oauthRequests.id, id)).get();
    if (!row || row.expiresAt < Date.now()) throw new NotFoundError('Authorization request', 'expired or unknown');
    const client = this.clientsStore.getClient(row.clientId) as OAuthClientInformationFull | undefined;
    if (!client) throw new NotFoundError('Client', row.clientId);
    return { row, client };
  }

  /** What the consent page shows: who is asking, and where the result will be sent. */
  describeRequest(id: string, boundTo: string | undefined) {
    const { row, client } = this.pending(id, boundTo);
    const target = new URL(row.redirectUri);
    return {
      clientName: client.client_name ?? 'Application sans nom',
      // Custom schemes (app://) have an opaque origin, so rebuild a readable one.
      redirectTo: target.origin !== 'null' ? target.origin : `${target.protocol}//${target.host || target.pathname}`,
      redirectUri: row.redirectUri,
      scopes: row.scopes.split(' '),
    };
  }

  /** Records the user's decision and returns the URL to send the browser back to the client with. */
  decide(id: string, user: CurrentUser, approve: boolean, boundTo: string | undefined): { redirectTo: string } {
    const { row } = this.pending(id, boundTo);
    this.db.delete(oauthRequests).where(eq(oauthRequests.id, id)).run();
    const target = new URL(row.redirectUri);
    if (row.state) target.searchParams.set('state', row.state);
    if (!approve) {
      target.searchParams.set('error', 'access_denied');
      return { redirectTo: target.href };
    }
    const code = randomToken();
    this.db
      .insert(authCodes)
      .values({
        codeHash: sha256(code),
        clientId: row.clientId,
        userId: user.id,
        redirectUri: row.redirectUri,
        codeChallenge: row.codeChallenge,
        scopes: row.scopes,
        resource: row.resource,
        expiresAt: Date.now() + CODE_TTL,
      })
      .run();
    target.searchParams.set('code', code);
    return { redirectTo: target.href };
  }

  // --- Token endpoint -----------------------------------------------------

  private codeRow(client: OAuthClientInformationFull, code: string) {
    const row = this.db
      .select()
      .from(authCodes)
      .where(eq(authCodes.codeHash, sha256(code)))
      .get();
    if (!row || row.clientId !== client.client_id || row.expiresAt < Date.now())
      throw new InvalidGrantError('Invalid or expired authorization code');
    return row;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    return this.codeRow(client, code).codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = this.codeRow(client, code);
    // Single use: delete before issuing; a replay then fails in codeRow.
    const claimed = this.db.delete(authCodes).where(eq(authCodes.codeHash, row.codeHash)).returning().get();
    if (!claimed) throw new InvalidGrantError('Authorization code already used');
    if (!redirectUri || redirectUri !== row.redirectUri)
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    return this.issueTokens(row.userId, client.client_id, row.scopes, row.resource);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const row = this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(refreshToken)))
      .get();
    if (!row || row.clientId !== client.client_id || row.expiresAt < Date.now())
      throw new InvalidGrantError('Invalid or expired refresh token');
    const previous = this.db.select().from(accessTokens).where(eq(accessTokens.id, row.accessTokenId)).get();
    if (!previous) throw new InvalidGrantError('Invalid refresh token');
    const granted = previous.scopes.split(' ').filter(Boolean);
    if (scopes?.some((s) => !granted.includes(s))) throw new InvalidRequestError('Requested scope exceeds the original grant');
    // Rotation: the old access token (and its refresh token, by cascade) stop working now.
    this.db.delete(accessTokens).where(eq(accessTokens.id, previous.id)).run();
    return this.issueTokens(row.userId, client.client_id, (scopes?.length ? scopes : granted).join(' '), previous.resource);
  }

  private issueTokens(userId: number, clientId: string, scopes: string, resource: string | null): OAuthTokens {
    const now = Date.now();
    const accessToken = randomToken();
    const refreshToken = randomToken();
    this.db.transaction(() => {
      const row = this.db
        .insert(accessTokens)
        .values({ tokenHash: sha256(accessToken), userId, clientId, scopes, resource, expiresAt: now + ACCESS_TTL, createdAt: now })
        .returning()
        .get();
      this.db
        .insert(refreshTokens)
        .values({ tokenHash: sha256(refreshToken), accessTokenId: row.id, clientId, userId, expiresAt: now + REFRESH_TTL })
        .run();
    });
    this.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now)).run();
    return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL / 1000, refresh_token: refreshToken, scope: scopes };
  }

  async revokeToken(client: OAuthClientInformationFull, { token }: OAuthTokenRevocationRequest): Promise<void> {
    const hash = sha256(token);
    const access = this.db
      .select()
      .from(accessTokens)
      .where(and(eq(accessTokens.tokenHash, hash), eq(accessTokens.clientId, client.client_id)))
      .get();
    const refresh = this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).get();
    const id = access?.id ?? (refresh?.clientId === client.client_id ? refresh.accessTokenId : undefined);
    if (id !== undefined) this.db.delete(accessTokens).where(eq(accessTokens.id, id)).run();
  }

  /** Used by the bearer middleware on /mcp: accepts OAuth access tokens and personal tokens. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const identity = this.accounts.verifyToken(token);
    if (!identity) throw new InvalidTokenError('Invalid or expired token');
    return {
      token,
      clientId: identity.clientId ?? 'personal-token',
      scopes: identity.scopes.length ? identity.scopes : SCOPES,
      expiresAt: identity.expiresAt ? Math.floor(identity.expiresAt / 1000) : NEVER,
      ...(identity.resource ? { resource: new URL(identity.resource) } : {}),
      extra: { userId: identity.userId, householdId: identity.householdId },
    };
  }
}
