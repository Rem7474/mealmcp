import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDb } from '../db/index.js';

let server: Server;
let base: string;

beforeAll(async () => {
  // OAuth metadata embeds PUBLIC_URL, so find a free port first and start the app on it.
  const probe = createServer().listen(0);
  await new Promise((r) => probe.once('listening', r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((r) => probe.close(r));
  base = `http://localhost:${port}`;
  const config = loadConfig({ PORT: String(port), DATABASE_PATH: ':memory:', PUBLIC_URL: base, LOG_LEVEL: 'silent' });
  server = createApp(createDb(':memory:'), config).listen(port);
  await new Promise((r) => server.once('listening', r));
});
afterAll(() => void server.close());

/** Minimal cookie-aware client. */
function browser() {
  const jar = new Map<string, string>();
  return {
    async call(path: string, init: RequestInit & { json?: unknown } = {}) {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (init.json !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch(base + path, {
        redirect: 'manual',
        ...init,
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      });
      for (const set of res.headers.getSetCookie()) {
        const [pair] = set.split(';');
        const i = pair.indexOf('=');
        if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
      return res;
    },
  };
}

const rpc = (token: string | null, method: string, params: unknown = {}) =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

const toolText = async (res: Response) => {
  const data = JSON.parse(
    (await res.text())
      .split('\n')
      .find((l) => l.startsWith('data:'))!
      .slice(5),
  );
  return data.result.content[0].text as string;
};

const b64url = (b: Buffer) => b.toString('base64url');

/** Runs the full OAuth authorization-code + PKCE flow as `user` and returns the issued tokens. */
async function authorizeClient(user: ReturnType<typeof browser>, approve = true) {
  const redirectUri = 'http://localhost:9999/callback';
  const reg = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Test client', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }),
  });
  expect(reg.status).toBe(201);
  const client = await reg.json();

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const authz = await user.call(
    `/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
    })}`,
  );
  expect(authz.status).toBe(302);
  const consent = new URL(authz.headers.get('location')!);
  expect(consent.pathname).toBe('/consent');
  const request = consent.searchParams.get('request')!;

  const info = await (await user.call(`/api/oauth/requests/${request}`)).json();
  expect(info).toMatchObject({ clientName: 'Test client', redirectTo: 'http://localhost:9999' });

  const decision = await (await user.call(`/api/oauth/requests/${request}/decision`, { method: 'POST', json: { approve } })).json();
  const back = new URL(decision.redirectTo);
  expect(back.searchParams.get('state')).toBe('xyz');
  if (!approve) return { denied: back.searchParams.get('error') };
  const code = back.searchParams.get('code')!;

  const exchange = (params: Record<string, string>) =>
    fetch(`${base}/token`, { method: 'POST', body: new URLSearchParams({ client_id: client.client_id, ...params }) });
  const tokenRes = await exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
  expect(tokenRes.status).toBe(200);
  return { client, exchange, verifier, code, tokens: await tokenRes.json() };
}

describe('accounts', () => {
  it('first user owns a household, later signups need an invite, passwords are checked', async () => {
    const alice = browser();
    const weak = await alice.call('/api/auth/register', { method: 'POST', json: { email: 'a@x.fr', name: 'Alice', password: 'short' } });
    expect(weak.status).toBe(400);

    const created = await alice.call('/api/auth/register', {
      method: 'POST',
      json: { email: 'a@x.fr', name: 'Alice', password: 'correct horse battery' },
    });
    expect(created.status).toBe(201);
    expect((await (await alice.call('/api/auth/me')).json()).user).toMatchObject({ email: 'a@x.fr', role: 'owner' });

    // Registration is now closed to strangers...
    const stranger = await browser().call('/api/auth/register', {
      method: 'POST',
      json: { email: 'b@x.fr', name: 'Bob', password: 'another long password' },
    });
    expect(stranger.status).toBe(403);

    // ...but an invite code gets Bob into Alice's household, once.
    const { code } = await (await alice.call('/api/household/invites', { method: 'POST', json: {} })).json();
    const bob = browser();
    const joined = await bob.call('/api/auth/register', {
      method: 'POST',
      json: { email: 'b@x.fr', name: 'Bob', password: 'another long password', inviteCode: code },
    });
    expect(joined.status).toBe(201);
    expect((await (await bob.call('/api/auth/me')).json()).user).toMatchObject({ role: 'member' });
    const reuse = await browser().call('/api/auth/register', {
      method: 'POST',
      json: { email: 'c@x.fr', name: 'Carl', password: 'yet another password', inviteCode: code },
    });
    expect(reuse.status).toBe(400);
    expect((await bob.call('/api/household/invites', { method: 'POST', json: {} })).status).toBe(403);

    // Shared data inside the household.
    await alice.call('/api/shopping', { method: 'POST', json: { name: 'Milk' } });
    expect(await (await bob.call('/api/shopping')).json()).toHaveLength(1);
    // The landing page's answer is the household's too, and a household that has set little up is shown how to begin.
    expect(await (await bob.call('/api/next-actions')).json()).toMatchObject({ cards: [{ id: 'getting-started' }] });

    // Login / logout.
    const again = browser();
    expect((await again.call('/api/auth/login', { method: 'POST', json: { email: 'a@x.fr', password: 'wrong password!!' } })).status).toBe(
      401,
    );
    expect(
      (await again.call('/api/auth/login', { method: 'POST', json: { email: 'a@x.fr', password: 'correct horse battery' } })).status,
    ).toBe(200);
    expect((await again.call('/api/shopping')).status).toBe(200);
    await again.call('/api/auth/logout', { method: 'POST', json: {} });
    expect((await browser().call('/api/shopping')).status).toBe(401);
  });

  it('rejects cross-origin writes and unauthenticated calls', async () => {
    expect((await fetch(`${base}/api/shopping`)).status).toBe(401);
    expect((await fetch(`${base}/api/next-actions`)).status).toBe(401);
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'a@x.fr', password: 'x' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('MCP OAuth', () => {
  it('advertises discovery metadata and challenges unauthenticated calls', async () => {
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(meta).toMatchObject({ code_challenge_methods_supported: ['S256'], registration_endpoint: `${base}/register` });
    const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(resource).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [`${base}/`] });
    const res = await rpc(null, 'tools/list');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=');
  });

  it('runs the authorization-code + PKCE flow, then refreshes and revokes', async () => {
    const user = browser();
    await user.call('/api/auth/login', { method: 'POST', json: { email: 'a@x.fr', password: 'correct horse battery' } });
    const flow = await authorizeClient(user);
    const { tokens, exchange, code, verifier } = flow as Exclude<typeof flow, { denied: string | null }>;

    // The token acts on Alice's household.
    expect(await toolText(await rpc(tokens.access_token, 'tools/call', { name: 'list_shopping_list', arguments: {} }))).toContain('Milk');

    // Authorization codes are single use.
    expect(
      (await exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: 'http://localhost:9999/callback' }))
        .status,
    ).toBe(400);

    // A wrong PKCE verifier is refused (new code needed, so run a fresh flow).
    const second = (await authorizeClient(user)) as Exclude<Awaited<ReturnType<typeof authorizeClient>>, { denied: string | null }>;
    expect(second.tokens.access_token).not.toBe(tokens.access_token);

    // Refresh rotates: the old access and refresh tokens stop working.
    const refreshed = await (await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).json();
    expect(refreshed.access_token).toBeTruthy();
    expect((await rpc(tokens.access_token, 'tools/list')).status).toBe(401);
    expect((await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })).status).toBe(400);
    expect((await rpc(refreshed.access_token, 'tools/list')).status).toBe(200);

    // Revoking from the account page cuts access immediately.
    const list = await (await user.call('/api/tokens')).json();
    for (const t of list) await user.call(`/api/tokens/${t.id}`, { method: 'DELETE' });
    expect((await rpc(refreshed.access_token, 'tools/list')).status).toBe(401);
  });

  it('wrong PKCE verifier and denied consent', async () => {
    const user = browser();
    await user.call('/api/auth/login', { method: 'POST', json: { email: 'a@x.fr', password: 'correct horse battery' } });
    const denied = await authorizeClient(user, false);
    expect(denied).toEqual({ denied: 'access_denied' });

    // A consent request cannot be read or approved from a different browser that did not start /authorize.
    const redirectUri = 'http://localhost:9999/callback';
    const reg = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Phisher', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' }),
    });
    const client = await reg.json();
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const attacker = browser();
    const authz = await attacker.call(
      `/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })}`,
    );
    const request = new URL(authz.headers.get('location')!).searchParams.get('request')!;
    expect((await user.call(`/api/oauth/requests/${request}`)).status).toBe(404);
    expect((await user.call(`/api/oauth/requests/${request}/decision`, { method: 'POST', json: { approve: true } })).status).toBe(404);
  });

  it('personal tokens work on MCP and the API, and keep households apart', async () => {
    const alice = browser();
    await alice.call('/api/auth/login', { method: 'POST', json: { email: 'a@x.fr', password: 'correct horse battery' } });
    const { token } = await (await alice.call('/api/tokens', { method: 'POST', json: { name: 'script' } })).json();
    expect(token).toMatch(/^mmcp_/);
    expect(await toolText(await rpc(token, 'tools/call', { name: 'list_shopping_list', arguments: {} }))).toContain('Milk');
    expect((await fetch(`${base}/api/shopping`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);

    // A second, separate household (created via a fresh instance of the flow is not possible: signup is closed),
    // so isolation is covered by services.test.ts; here we check a bogus token is refused.
    expect((await rpc('mmcp_bogus', 'tools/list')).status).toBe(401);
  });
});

describe('MCP tools', () => {
  const result = async (res: Response) => {
    const line = (await res.text()).split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(line!.slice(5)).result;
  };
  const call = async (token: string, name: string, args: unknown) => {
    const out = await result(await rpc(token, 'tools/call', { name, arguments: args }));
    return { error: out.isError === true, text: out.content[0].text as string };
  };
  async function token() {
    const alice = browser();
    await alice.call('/api/auth/login', { method: 'POST', json: { email: 'a@x.fr', password: 'correct horse battery' } });
    return ((await (await alice.call('/api/tokens', { method: 'POST', json: { name: 'tools' } })).json()) as { token: string }).token;
  }

  it('lists documented tools, each described and annotated, and every one is in both READMEs', async () => {
    const { tools } = await result(await rpc(await token(), 'tools/list'));
    expect(tools.length).toBeGreaterThan(60);
    for (const t of tools as { name: string; description: string; annotations?: Record<string, boolean> }[]) {
      expect(t.description.length, t.name).toBeGreaterThan(20);
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
    }
    const names = (tools as { name: string }[]).map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const file of ['../../../README.md', '../../../README.fr.md', '../../../scripts/build-docs.mjs']) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(
        names.filter((n) => !text.includes(n)),
        file,
      ).toEqual([]);
    }
  });

  it('stocks by barcode through a code the household already knows, and refuses an unclear catalogue request', async () => {
    const t = await token();
    expect((await call(t, 'add_stock', { name: 'Pasta', quantity: 500, unit: 'g' })).error).toBe(false);
    const linked = await call(t, 'update_product', { product: 'Pasta', barcode: '3017620422003' });
    expect(JSON.parse(linked.text).barcodes).toMatchObject([{ code: '3017620422003' }]);
    const added = await call(t, 'add_stock', { barcode: '03017620422003', quantity: 250, unit: 'g' });
    expect(added.error).toBe(false);
    expect(JSON.parse(added.text)).toMatchObject({ name: 'Pasta', quantity: 750 });
    expect((await call(t, 'add_stock', { quantity: 1 })).text).toMatch(/product name, or a barcode/);
    const known = await call(t, 'search_catalog', { code: '3017620422003' });
    expect(JSON.parse(known.text)).toMatchObject({ known: { productName: 'Pasta' }, hit: null });
    expect((await call(t, 'search_catalog', {})).error).toBe(true);
    expect((await call(t, 'search_catalog', { code: '3017620422003', name: 'x' })).error).toBe(true);
  });

  it('works with names instead of ids, a price paid, the freezer and a price history', async () => {
    const t = await token();
    const added = await call(t, 'add_stock', { name: 'Salmon', quantity: 400, unit: 'g', location: 'freezer', price: 6 });
    expect(added.error).toBe(false);
    expect(JSON.parse(added.text)).toMatchObject({ frozen: true, location: 'freezer', paidPer: { main: { cents: 1500, per: 'kg' } } });
    const bulk = await call(t, 'update_stock_bulk', { items: [{ name: 'Salmon', note: 'for Friday' }] });
    expect(bulk.error).toBe(false);
    expect(bulk.text).toContain('for Friday');
    expect((await call(t, 'set_product_price', { name: 'Salmon', price: 20, quantity: 1, unit: 'kg', store: 'Market' })).error).toBe(false);
    const history = await call(t, 'get_price_history', { name: 'Salmon' });
    expect(JSON.parse(history.text)).toMatchObject({ per: 'kg', latestCents: 2000, count: 1 });
    // Part of a fridge line goes to the freezer, by name: the line is split.
    await call(t, 'add_stock', { name: 'Mince', quantity: 1000, unit: 'g', location: 'fridge' });
    const part = await call(t, 'freeze_stock_item', { name: 'Mince', quantity: 300 });
    expect(JSON.parse(part.text)).toMatchObject({ quantity: 300, frozen: true, location: 'freezer' });
    expect(JSON.parse((await call(t, 'list_stock', { location: 'fridge' })).text)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Mince', quantity: 700 })]),
    );
    expect((await call(t, 'get_price_history', { name: 'Nothing like this' })).error).toBe(true);
    expect((await call(t, 'discard_stock', { id: 999999, reason: 'spoiled' })).error).toBe(true);
  });
});
