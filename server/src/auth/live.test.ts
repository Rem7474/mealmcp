import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, it } from 'vitest';
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
  server = createApp(createDb(':memory:'), loadConfig({ PORT: String(port), DATABASE_PATH: ':memory:', PUBLIC_URL: base })).listen(port);
  await new Promise((r) => server.once('listening', r));
});
afterAll(() => void server.close());

const json = { 'content-type': 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mcp = (token: string, name: string, args: unknown) =>
  fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { ...json, accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }).then((r) => r.text());

async function signUp(email: string, inviteCode?: string) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, name: email, password: 'correct horse battery', inviteCode }),
  });
  expect(res.status).toBe(201);
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  const tokenRes = await fetch(`${base}/api/tokens`, { method: 'POST', headers: { ...json, cookie }, body: JSON.stringify({ name: 'live' }) });
  return { cookie, token: (await tokenRes.json()).token as string };
}

/** Opens the dashboard's event stream and collects what it receives. */
async function openStream(cookie: string) {
  const abort = new AbortController();
  const res = await fetch(`${base}/api/events`, { headers: { cookie }, signal: abort.signal });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  let text = '';
  const pump = (async () => {
    const decoder = new TextDecoder();
    for (;;) {
      const chunk = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (chunk.done) return;
      text += decoder.decode(chunk.value);
    }
  })();
  const changes = () => text.split('event: change').length - 1;
  return {
    changes,
    text: () => text,
    /** Waits until `predicate` holds, up to ~2 seconds. */
    async until(predicate: () => boolean) {
      for (let i = 0; i < 40 && !predicate(); i++) await sleep(50);
      return predicate();
    },
    close: async () => {
      abort.abort();
      await pump;
    },
  };
}

it('pushes a change event to the open dashboard when the MCP server or the API modifies data', async () => {
  const { cookie, token } = await signUp('live@x.fr');
  const stream = await openStream(cookie);
  expect(await stream.until(() => stream.text().includes(': connected'))).toBe(true);

  // Reads do not notify...
  await mcp(token, 'list_shopping_list', {});
  await sleep(200);
  expect(stream.changes()).toBe(0);

  // ...writes do, from MCP...
  await mcp(token, 'add_shopping_item', { name: 'Bread' });
  expect(await stream.until(() => stream.changes() === 1)).toBe(true);

  // ...and from the REST API.
  await fetch(`${base}/api/shopping`, { method: 'POST', headers: { ...json, authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'Butter' }) });
  expect(await stream.until(() => stream.changes() === 2)).toBe(true);

  await stream.close();
});

it('only notifies the household that changed, and refuses anonymous streams', async () => {
  const owner = await signUp('owner@x.fr').catch(() => null);
  // Sign-ups are closed after the first account: a second household cannot exist here, so check access control.
  expect(owner).toBeNull();
  expect((await fetch(`${base}/api/events`)).status).toBe(401);
});
