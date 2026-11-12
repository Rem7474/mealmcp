import { and, count, desc, eq, gt, isNull, like, lt, ne } from 'drizzle-orm';
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

export const passwordChangeInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: registerInput.shape.password,
});

export const accountDeleteInput = z.object({ password: z.string().min(1).max(200) });

export const tokenInput = z.object({
  name: z.string().trim().min(1).max(80),
  /** Days until the token stops working; omitted or null for a token that never expires. */
  expiresInDays: z.number().int().min(1).max(3650).nullish(),
});

/** One message for every way an invite can be unusable, so it does not say which invites exist. */
const BAD_INVITE = 'This invite code is invalid, expired or already used';
/** Same wording whether or not the email is taken, so sign-up is not an oracle for existing accounts. */
const CANNOT_REGISTER = 'This account could not be created. Check your details, or sign in if you already have an account';

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

      const invite = input.inviteCode
        ? db
            .select()
            .from(invites)
            .where(eq(invites.codeHash, sha256(input.inviteCode)))
            .get()
        : undefined;
      if (input.inviteCode && (!invite || invite.usedAt || invite.expiresAt < Date.now())) throw new ValidationError(BAD_INVITE);
      if (!invite && !svc.registrationOpen()) throw new ForbiddenError('Registration is closed: ask a household member for an invite code');

      // Hash before looking the email up: a taken address costs the same time as a free one.
      const passwordHash = await hashPassword(input.password);
      const now = Date.now();
      const id = db.transaction(() => {
        if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) throw new ValidationError(CANNOT_REGISTER);
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
          if (!claimed) throw new ValidationError(BAD_INVITE);
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
        return db.insert(users).values({ email, name: input.name, passwordHash, householdId, role, createdAt: now }).returning().get().id;
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

    createSession(userId: number, userAgent?: string): string {
      const token = randomToken();
      const now = Date.now();
      db.insert(sessions)
        .values({
          tokenHash: sha256(token),
          userId,
          expiresAt: now + SESSION_TTL,
          createdAt: now,
          lastSeenAt: now,
          userAgent: userAgent?.slice(0, 200) || null,
        })
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
      if (!session) return null;
      const now = Date.now();
      if (now - session.lastSeenAt > 60_000)
        db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.tokenHash, session.tokenHash)).run();
      return svc.getUser(session.userId);
    },

    /** The signed-in devices of a user. `id` is a public handle (the start of the stored hash), never the cookie. */
    listSessions(userId: number, currentToken?: string) {
      const current = currentToken ? sha256(currentToken) : null;
      return db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, Date.now())))
        .orderBy(desc(sessions.lastSeenAt))
        .all()
        .map((r) => ({
          id: r.tokenHash.slice(0, 16),
          createdAt: r.createdAt || null,
          lastSeenAt: r.lastSeenAt || null,
          expiresAt: r.expiresAt,
          userAgent: r.userAgent,
          current: r.tokenHash === current,
        }));
    },

    revokeSession(userId: number, handle: string) {
      if (!/^[0-9a-f]{16}$/.test(handle)) throw new NotFoundError('Session', handle);
      const removed = db
        .delete(sessions)
        .where(and(eq(sessions.userId, userId), like(sessions.tokenHash, `${handle}%`)))
        .returning()
        .all();
      if (!removed.length) throw new NotFoundError('Session', handle);
    },

    /** Signs the user out everywhere except on the device that asks. */
    revokeOtherSessions(userId: number, currentToken: string) {
      db.delete(sessions)
        .where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, sha256(currentToken))))
        .run();
    },

    // --- Password and account ----------------------------------------------

    /** Changes the password after checking the current one, and signs every other device out. */
    async changePassword(userId: number, input: z.infer<typeof passwordChangeInput>, currentToken?: string) {
      const row = db.select().from(users).where(eq(users.id, userId)).get();
      if (!row) throw new NotFoundError('User', userId);
      if (!(await verifyPassword(input.currentPassword, row.passwordHash))) throw new UnauthorizedError('Current password is incorrect');
      const passwordHash = await hashPassword(input.newPassword);
      db.transaction(() => {
        db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
        const others = currentToken ? ne(sessions.tokenHash, sha256(currentToken)) : undefined;
        db.delete(sessions)
          .where(and(eq(sessions.userId, userId), others))
          .run();
      });
    },

    /**
     * Deletes the account after checking the password. A member just leaves; the owner of a household
     * that still has other members must remove them first, and an owner alone takes the household
     * (and all its kitchen data) with them.
     */
    async deleteAccount(user: CurrentUser, password: string) {
      const row = db.select().from(users).where(eq(users.id, user.id)).get();
      if (!row || !(await verifyPassword(password, row.passwordHash))) throw new UnauthorizedError('Password is incorrect');
      db.transaction(() => {
        if (user.role === 'owner') {
          if (svc.members(user.householdId).length > 1)
            throw new ForbiddenError('Remove the other members of the household first, or they would lose their data');
          db.delete(households).where(eq(households.id, user.householdId)).run();
        } else {
          db.delete(users).where(eq(users.id, user.id)).run();
        }
      });
    },

    /** Owner only: takes a member out of the household. Their sessions and tokens go with them. */
    removeMember(owner: CurrentUser, memberId: number) {
      if (owner.role !== 'owner') throw new ForbiddenError('Only the household owner can remove members');
      if (memberId === owner.id) throw new ValidationError('You cannot remove yourself: delete your account instead');
      const removed = db
        .delete(users)
        .where(and(eq(users.id, memberId), eq(users.householdId, owner.householdId)))
        .returning()
        .get();
      if (!removed) throw new NotFoundError('Member', memberId);
    },

    destroySession(token: string) {
      db.delete(sessions)
        .where(eq(sessions.tokenHash, sha256(token)))
        .run();
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

    createPersonalToken(userId: number, name: string, expiresInDays?: number | null) {
      const token = PAT_PREFIX + randomToken();
      const now = Date.now();
      const expiresAt = expiresInDays ? now + expiresInDays * DAY : null;
      const row = db
        .insert(accessTokens)
        .values({ tokenHash: sha256(token), userId, name, createdAt: now, expiresAt })
        .returning()
        .get();
      return { id: row.id, token, expiresAt };
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
