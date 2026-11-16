import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDb } from '../db/index.js';

/** A real app on a free port with an in-memory database, and a way to sign up households that call it as a browser. */
export async function startTestApp() {
  const probe = createServer().listen(0);
  await new Promise((r) => probe.once('listening', r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((r) => probe.close(r));
  const base = `http://localhost:${port}`;
  const config = loadConfig({
    PORT: String(port),
    DATABASE_PATH: ':memory:',
    PUBLIC_URL: base,
    LOG_LEVEL: 'silent',
    ALLOW_REGISTRATION: 'true',
  });
  const server: Server = createApp(createDb(':memory:'), config).listen(port);
  await new Promise((r) => server.once('listening', r));

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
    const res = await call('/api/auth/register', 'POST', { email: `user${++n}@x.test`, name: 'W', password: 'correct horse battery' });
    expect(res.status).toBe(201);
    return call;
  }
  return { base, signUp, close: () => void server.close() };
}
