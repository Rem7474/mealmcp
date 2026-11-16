import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDb } from '../db/index.js';
import { addDays, today } from '../domain/dates.js';

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
  const res = await call('/api/auth/register', 'POST', { email: `week${++n}@x.test`, name: 'W', password: 'correct horse battery' });
  expect(res.status).toBe(201);
  return call;
}

const key = (i: number) => encodeURIComponent(`${addDays(today(), 3 + i)}|dinner`);

describe('plan the week over HTTP', () => {
  it('proposes, reviews and applies, and stays inside the household', async () => {
    const a = await signUp();
    for (const name of ['Soup', 'Stew'])
      await a('/api/recipes', 'POST', { name, servings: 2, ingredients: [{ name: `${name} base`, quantity: 100, unit: 'g' }] });
    const meals = [0, 1].map((i) => ({ date: addDays(today(), 3 + i), mealType: 'dinner' }));

    const started = await a('/api/plan/week', 'POST', { meals });
    expect(started.status).toBe(201);
    const plan = await started.json();
    expect(plan.slots).toHaveLength(2);
    expect((await (await a('/api/plan/week')).json()).id).toBe(plan.id);
    expect((await a(`/api/plan?from=${meals[0].date}&to=${meals[1].date}`).then((r) => r.json())) as unknown[]).toHaveLength(0);

    expect((await a(`/api/plan/week/${plan.id}/slots/${key(0)}/accept`, 'POST')).status).toBe(200);
    expect((await a(`/api/plan/week/${plan.id}/slots/${key(1)}/refuse`, 'POST')).status).toBe(200);
    const applied = await (await a(`/api/plan/week/${plan.id}/apply`, 'POST')).json();
    expect(applied.planned).toHaveLength(1);
    expect((await a(`/api/plan/week/${plan.id}/apply`, 'POST')).status).toBe(400);

    const stranger = await signUp();
    expect((await stranger(`/api/plan/week/${plan.id}`)).status).toBe(404);
    expect((await stranger(`/api/plan/week/${plan.id}/apply`, 'POST')).status).toBe(404);
  });

  it('rejects malformed input without a stack trace', async () => {
    const a = await signUp();
    expect((await a('/api/plan/week', 'POST', { meals: [] })).status).toBe(400);
    expect((await a('/api/plan/week/1/slots/nope/accept', 'POST')).status).toBe(400);
    expect((await a('/api/plan/week/abc')).status).toBe(400);
    expect((await a('/api/plan/week/999')).status).toBe(404);
  });
});
