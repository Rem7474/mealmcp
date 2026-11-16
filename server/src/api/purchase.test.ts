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
  });
  server = createApp(createDb(':memory:'), config).listen(port);
  await new Promise((r) => server.once('listening', r));
});
afterAll(() => void server.close());

let n = 0;
async function signUp() {
  let cookie = '';
  const call = async (path: string, method = 'GET', json?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  const res = await call('/api/auth/register', 'POST', { email: `buy${++n}@x.test`, name: 'W', password: 'correct horse battery' });
  expect(res.status).toBe(201);
  return call;
}

describe('shopping done, from text, over HTTP', () => {
  it('proposes, then puts away what was reviewed', async () => {
    const a = await signUp();
    await a('/api/shopping', 'POST', { name: 'Rice', quantity: 1, unit: 'kg' });
    const parsed = await a('/api/shopping/from-text', 'POST', { text: '2 kg rice 3.10€\n6 eggs' });
    expect(parsed.status).toBe(200);
    const { lines } = await parsed.json();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: 'Rice', match: 'name', onList: true });
    // Reading wrote nothing.
    expect(await (await a('/api/stock')).json()).toHaveLength(0);

    const applied = await a('/api/shopping/from-text/apply', 'POST', {
      lines: [
        { name: 'Rice', quantity: 2, unit: 'kg', price: 3.1 },
        { name: 'Eggs', quantity: 6 },
      ],
      location: 'pantry',
    });
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ addedToStock: 2, removedFromList: 1 });
    expect(await (await a('/api/stock')).json()).toHaveLength(2);
    expect(await (await a('/api/shopping')).json()).toHaveLength(0);
  });

  it('keeps households apart and rejects bad input', async () => {
    const a = await signUp();
    const b = await signUp();
    await a('/api/shopping/from-text/apply', 'POST', { lines: [{ name: 'Secret', quantity: 1 }] });
    expect(await (await b('/api/stock')).json()).toHaveLength(0);
    expect((await b('/api/shopping/from-text', 'POST', { text: 'secret' })).status).toBe(200);
    expect(
      ((await (await b('/api/shopping/from-text', 'POST', { text: 'secret' })).json()) as { lines: { match: string }[] }).lines[0].match,
    ).toBe('new');
    expect((await a('/api/shopping/from-text', 'POST', { text: '' })).status).toBe(400);
    expect((await a('/api/shopping/from-text', 'POST', { text: 'x'.repeat(5001) })).status).toBe(400);
    expect((await a('/api/shopping/from-text/apply', 'POST', { lines: [] })).status).toBe(400);
    expect((await a('/api/shopping/from-text/apply', 'POST', { lines: [{ name: 'x', quantity: -1 }] })).status).toBe(400);
  });
});
