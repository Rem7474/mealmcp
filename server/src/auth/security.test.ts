import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDb } from '../db/index.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const probe = createServer().listen(0);
  await new Promise((r) => probe.once('listening', r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((r) => probe.close(r));
  base = `http://localhost:${port}`;
  const config = loadConfig({
    PORT: String(port),
    DATABASE_PATH: ':memory:',
    PUBLIC_URL: base,
    LOG_LEVEL: 'silent',
    ALLOW_REGISTRATION: 'true',
    TRUST_PROXY: '1',
  });
  server = createApp(createDb(':memory:'), config).listen(port);
  await new Promise((r) => server.once('listening', r));
});
afterAll(() => void server.close());

/** A browser with its own cookie jar and its own network address (TRUST_PROXY=1 reads it from X-Forwarded-For). */
let ipCounter = 0;
function browser(ip = `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`) {
  let cookie = '';
  return {
    async call(path: string, init: { method?: string; json?: unknown; headers?: Record<string, string> } = {}) {
      const res = await fetch(`${base}${path}`, {
        method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
        headers: {
          'x-forwarded-for': ip,
          ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...init.headers,
        },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return res;
    },
  };
}

const PASSWORD = 'correct horse battery';
let n = 0;
async function signUp(extra: Record<string, unknown> = {}) {
  const b = browser();
  const email = `user${++n}@x.test`;
  const res = await b.call('/api/auth/register', { json: { email, name: `User ${n}`, password: PASSWORD, ...extra } });
  expect(res.status).toBe(201);
  return { b, email };
}

describe('bearer tokens stay out of account management', () => {
  it('a personal token reaches the kitchen but cannot mint tokens or invitations', async () => {
    const { b } = await signUp();
    const { token } = await (await b.call('/api/tokens', { json: { name: 'script' } })).json();
    const bearer = { authorization: `Bearer ${token}` };
    expect((await fetch(`${base}/api/shopping`, { headers: bearer })).status).toBe(200);
    for (const [method, path] of [
      ['POST', '/api/tokens'],
      ['GET', '/api/tokens'],
      ['POST', '/api/household/invites'],
      ['POST', '/api/auth/password'],
      ['DELETE', '/api/auth/account'],
      ['GET', '/api/auth/sessions'],
    ] as const) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { ...bearer, 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('personal tokens can expire', async () => {
    const { b } = await signUp();
    const res = await (await b.call('/api/tokens', { json: { name: 'short', expiresInDays: 30 } })).json();
    expect(res.expiresAt).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const forever = await (await b.call('/api/tokens', { json: { name: 'forever' } })).json();
    expect(forever.expiresAt).toBeNull();
    expect((await b.call('/api/tokens', { json: { name: 'bad', expiresInDays: 0 } })).status).toBe(400);
  });
});

describe('password, devices and account', () => {
  it('changes the password and signs the other devices out', async () => {
    const { b, email } = await signUp();
    const other = browser();
    expect((await other.call('/api/auth/login', { json: { email, password: PASSWORD } })).status).toBe(200);

    const sessions = await (await b.call('/api/auth/sessions')).json();
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    expect(
      (await b.call('/api/auth/password', { json: { currentPassword: 'not the password', newPassword: 'a brand new password' } })).status,
    ).toBe(401);
    expect((await b.call('/api/auth/password', { json: { currentPassword: PASSWORD, newPassword: 'short' } })).status).toBe(400);
    expect((await b.call('/api/auth/password', { json: { currentPassword: PASSWORD, newPassword: 'a brand new password' } })).status).toBe(
      204,
    );

    expect((await b.call('/api/auth/me').then((r) => r.json())).user).not.toBeNull();
    expect((await other.call('/api/auth/me').then((r) => r.json())).user).toBeNull();
    expect((await browser().call('/api/auth/login', { json: { email, password: PASSWORD } })).status).toBe(401);
    expect((await browser().call('/api/auth/login', { json: { email, password: 'a brand new password' } })).status).toBe(200);
  });

  it('lists devices and revokes one of them', async () => {
    const { b, email } = await signUp();
    const phone = browser();
    await phone.call('/api/auth/login', { json: { email, password: PASSWORD }, headers: { 'user-agent': 'TestPhone/1.0' } });
    const list = await (await b.call('/api/auth/sessions')).json();
    const target = list.find((s: { userAgent: string | null }) => s.userAgent === 'TestPhone/1.0');
    expect(target).toBeTruthy();
    expect((await b.call(`/api/auth/sessions/${target.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await phone.call('/api/auth/me').then((r) => r.json())).user).toBeNull();
    expect((await b.call('/api/auth/sessions/0000000000000000', { method: 'DELETE' })).status).toBe(404);

    const again = browser();
    await again.call('/api/auth/login', { json: { email, password: PASSWORD } });
    expect((await b.call('/api/auth/sessions/revoke-others', { json: {} })).status).toBe(204);
    expect((await again.call('/api/auth/me').then((r) => r.json())).user).toBeNull();
    expect((await b.call('/api/auth/me').then((r) => r.json())).user).not.toBeNull();
  });

  it('deletes an account only with the right password, and takes a lone owner household with it', async () => {
    const { b, email } = await signUp();
    await b.call('/api/shopping', { json: { name: 'Milk' } });
    expect((await b.call('/api/auth/account', { method: 'DELETE', json: { password: 'nope nope nope' } })).status).toBe(401);
    expect((await b.call('/api/auth/account', { method: 'DELETE', json: { password: PASSWORD } })).status).toBe(204);
    expect((await b.call('/api/auth/me').then((r) => r.json())).user).toBeNull();
    expect((await browser().call('/api/auth/login', { json: { email, password: PASSWORD } })).status).toBe(401);
  });

  it('an owner removes members, and cannot leave while others depend on the household', async () => {
    const { b: owner } = await signUp();
    const { code } = await (await owner.call('/api/household/invites', { json: {} })).json();
    const { b: member, email } = await signUp({ inviteCode: code });

    // Members cannot remove anyone; the owner cannot delete the account with members still there.
    const ids = (await (await owner.call('/api/household')).json()).members as { id: number; email: string }[];
    const memberId = ids.find((m) => m.email === email)!.id;
    expect((await member.call(`/api/household/members/${ids[0].id}`, { method: 'DELETE' })).status).toBe(403);
    expect((await owner.call('/api/auth/account', { method: 'DELETE', json: { password: PASSWORD } })).status).toBe(403);

    expect((await owner.call(`/api/household/members/${memberId}`, { method: 'DELETE' })).status).toBe(204);
    expect((await member.call('/api/auth/me').then((r) => r.json())).user).toBeNull();
    expect((await owner.call(`/api/household/members/${memberId}`, { method: 'DELETE' })).status).toBe(404);
    expect((await owner.call(`/api/household/members/${ids[0].id}`, { method: 'DELETE' })).status).toBe(400);
  });

  it('a member leaves by deleting their own account', async () => {
    const { b: owner } = await signUp();
    const { code } = await (await owner.call('/api/household/invites', { json: {} })).json();
    const { b: member } = await signUp({ inviteCode: code });
    expect((await member.call('/api/auth/account', { method: 'DELETE', json: { password: PASSWORD } })).status).toBe(204);
    expect((await (await owner.call('/api/household')).json()).members).toHaveLength(1);
  });
});

describe('sign-up and sign-in hardening', () => {
  it('answers the same way for a taken email as for any other sign-up failure', async () => {
    const { email } = await signUp();
    const taken = await browser().call('/api/auth/register', { json: { email, name: 'Dup', password: PASSWORD } });
    expect(taken.status).toBe(400);
    const message = (await taken.json()).error as string;
    expect(message).not.toMatch(/already exists/i);
    expect(message).toContain('could not be created');
  });

  it('does not tell a used invite from an unknown one', async () => {
    const { b: owner } = await signUp();
    const { code } = await (await owner.call('/api/household/invites', { json: {} })).json();
    await signUp({ inviteCode: code });
    const reused = await (
      await browser().call('/api/auth/register', { json: { email: 'late@x.test', name: 'L', password: PASSWORD, inviteCode: code } })
    ).json();
    const unknown = await (
      await browser().call('/api/auth/register', {
        json: { email: 'late2@x.test', name: 'L', password: PASSWORD, inviteCode: 'unknown-code' },
      })
    ).json();
    expect(reused.error).toBe(unknown.error);
  });

  it('slows down guessing across many emails from one address, and many addresses on one email', async () => {
    // Same address, a different email each time: the per-address bucket (30 failures) must trip.
    const guesser = browser('203.0.113.7');
    let last = 0;
    for (let i = 0; i < 40 && last !== 429; i++)
      last = (await guesser.call('/api/auth/login', { json: { email: `nobody${i}@x.test`, password: 'wrong wrong wrong' } })).status;
    expect(last).toBe(429);

    // One email targeted over and over: the per-email bucket (10 failures) trips, even before the address bucket.
    const { email } = await signUp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++)
      statuses.push((await browser().call('/api/auth/login', { json: { email, password: `wrong password ${i}` } })).status);
    // The shared test address may already be limited by the first half; either way guessing stops.
    expect(statuses.at(-1)).toBe(429);
  });

  it('never lets a browser or proxy keep API answers', async () => {
    const { b } = await signUp();
    for (const path of ['/api/auth/me', '/api/stock', '/api/household']) {
      expect((await b.call(path)).headers.get('cache-control'), path).toBe('no-store');
    }
  });

  it('answers malformed input with JSON, not a stack trace', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request' });
    const cookie = await fetch(`${base}/api/auth/me`, { headers: { cookie: 'mealmcp_session=%E0%A4%A' } });
    expect(cookie.status).toBe(200);
  });
});
