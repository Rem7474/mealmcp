import { and, count, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { accessTokens, households, invites, sessions, users } from '../db/schema.js';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../domain/errors.js';
import { DUMMY_HASH, hashPassword, randomToken, sha256, verifyPassword } from './crypto.js';

const DAY = 86_400_000;
export const SESSION_TTL = 30 * DAY;
const INVITE_TTL = 7 * DAY;
export const PAT_PREFIX = 'mmcp_';

export const registerInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(10, 'Password must be at least 10 characters').max(200),
  inviteCode: z.string().trim().min(1).optional(),
  householdName: z.string().trim().min(1).max(80).optional(),
});

export const loginInput = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'member';
  householdId: number;
  householdName: string;
  currency: string;
}

/** What a verified bearer token resolves to. */
export interface TokenIdentity {
  tokenId: number;
  userId: number;
  householdId: number;
  clientId: string | null;
  scopes: string[];
  /** Epoch milliseconds; null for personal tokens that never expire. */
  expiresAt: number | null;
  resource: string | null;
}

export function createAccountService(db: Db, config: Config) {
  const userView = () =>
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        householdId: users.householdId,
        householdName: households.name,
        currency: households.currency,
      })
      .from(users)
      .innerJoin(households, eq(households.id, users.householdId));

  const svc = {
    userCount() {
      return db.select({ n: count() }).from(users).get()?.n ?? 0;
    },

    /** Lets the login page know whether to offer "create an account" without an invite. */
    registrationOpen() {
      return svc.userCount() === 0 || config.allowRegistration;
    },

    async register(input: z.infer<typeof registerInput>): Promise<CurrentUser> {
      const email = input.email;
      if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get())
        throw new ValidationError('An account with this email already exists');

      const invite = input.inviteCode
        ? db.select().from(invites).where(eq(invites.codeHash, sha256(input.inviteCode))).get()
        : undefined;
      if (input.inviteCode && (!invite || invite.usedAt || invite.expiresAt < Date.now()))
        throw new ValidationError('This invite code is invalid or has expired');
      if (!invite && !svc.registrationOpen())
        throw new ForbiddenError('Registration is closed: ask a household member for an invite code');

      const passwordHash = await hashPassword(input.password);
      const now = Date.now();
      const id = db.transaction(() => {
        let householdId: number;
        let role: 'owner' | 'member';
        if (invite) {
          // Claim the invite atomically: the update only matches while it is still unused.
          const claimed = db
            .update(invites)
            .set({ usedAt: now })
            .where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
            .returning()
            .get();
          if (!claimed) throw new ValidationError('This invite code was already used');
          householdId = invite.householdId;
          role = 'member';
        } else {
          householdId = db
            .insert(households)
            .values({ name: input.householdName ?? `${input.name}'s household`, createdAt: now })
            .returning()
            .get().id;
          role = 'owner';
        }
        return db
          .insert(users)
          .values({ email, name: input.name, passwordHash, householdId, role, createdAt: now })
          .returning()
          .get().id;
      });
      return svc.getUser(id);
    },

    async login(input: z.infer<typeof loginInput>): Promise<CurrentUser> {
      const row = db.select().from(users).where(eq(users.email, input.email)).get();
      // Always run one scrypt, even for unknown emails, so response time does not reveal which exist.
      const ok = await verifyPassword(input.password, row?.passwordHash ?? DUMMY_HASH);
      if (!row || !ok) throw new UnauthorizedError('Invalid email or password');
      return svc.getUser(row.id);
    },

    getUser(id: number): CurrentUser {
      const user = userView().where(eq(users.id, id)).get();
      if (!user) throw new NotFoundError('User', id);
      return user;
    },

    // --- Browser sessions -------------------------------------------------

    createSession(userId: number): string {
      const token = randomToken();
      db.insert(sessions)
        .values({ tokenHash: sha256(token), userId, expiresAt: Date.now() + SESSION_TTL })
        .run();
      // Housekeeping: drop expired sessions whenever a new one is created.
      db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
      return token;
    },

    userForSession(token: string): CurrentUser | null {
      const session = db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, Date.now())))
        .get();
      return session ? svc.getUser(session.userId) : null;
    },

    destroySession(token: string) {
      db.delete(sessions).where(eq(sessions.tokenHash, sha256(token))).run();
    },

    // --- Household --------------------------------------------------------

    members(householdId: number) {
      return db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.householdId, householdId))
        .orderBy(users.id)
        .all();
    },

    createInvite(user: CurrentUser) {
      if (user.role !== 'owner') throw new ForbiddenError('Only the household owner can invite people');
      const code = randomToken(12);
      const expiresAt = Date.now() + INVITE_TTL;
      db.insert(invites)
        .values({ householdId: user.householdId, codeHash: sha256(code), createdBy: user.id, expiresAt })
        .run();
      return { code, expiresAt };
    },

    // --- Bearer tokens (personal tokens and OAuth access tokens) ----------

    createPersonalToken(userId: number, name: string) {
      const token = PAT_PREFIX + randomToken();
      const row = db
        .insert(accessTokens)
        .values({ tokenHash: sha256(token), userId, name, createdAt: Date.now() })
        .returning()
        .get();
      return { id: row.id, token };
    },

    /** Everything that can act on behalf of the user: personal tokens and apps authorised through OAuth. */
    listTokens(userId: number) {
      return db
        .select({
          id: accessTokens.id,
          name: accessTokens.name,
          clientId: accessTokens.clientId,
          createdAt: accessTokens.createdAt,
          lastUsedAt: accessTokens.lastUsedAt,
          expiresAt: accessTokens.expiresAt,
        })
        .from(accessTokens)
        .where(eq(accessTokens.userId, userId))
        .orderBy(desc(accessTokens.id))
        .all();
    },

    revokeToken(userId: number, id: number) {
      const removed = db
        .delete(accessTokens)
        .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, userId)))
        .returning()
        .get();
      if (!removed) throw new NotFoundError('Token', id);
    },

    /** Resolves a raw bearer token to who it acts for, or null if unknown or expired. */
    verifyToken(raw: string): TokenIdentity | null {
      const row = db
        .select({
          tokenId: accessTokens.id,
          userId: accessTokens.userId,
          householdId: users.householdId,
          clientId: accessTokens.clientId,
          scopes: accessTokens.scopes,
          expiresAt: accessTokens.expiresAt,
          resource: accessTokens.resource,
          lastUsedAt: accessTokens.lastUsedAt,
        })
        .from(accessTokens)
        .innerJoin(users, eq(users.id, accessTokens.userId))
        .where(eq(accessTokens.tokenHash, sha256(raw)))
        .get();
      if (!row || (row.expiresAt !== null && row.expiresAt < Date.now())) return null;
      const now = Date.now();
      if (!row.lastUsedAt || now - row.lastUsedAt > 60_000)
        db.update(accessTokens).set({ lastUsedAt: now }).where(eq(accessTokens.id, row.tokenId)).run();
      const { lastUsedAt: _ignored, scopes, ...rest } = row;
      return { ...rest, scopes: scopes ? scopes.split(' ') : [] };
    },
  };
  return svc;
}

export type AccountService = ReturnType<typeof createAccountService>;
