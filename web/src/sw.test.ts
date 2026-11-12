// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type Listener = (event: Record<string, unknown>) => void;

/** Loads public/sw.js in a sandbox with a fake Cache API and returns what it registered. */
function load() {
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Map<string, Response>>();
  const cache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name) as Map<string, Response>;
    return {
      put: async (req: string | { url: string }, res: Response) =>
        void m.set(typeof req === 'string' ? req : new URL(req.url).pathname, res),
    };
  };
  const caches = {
    open: async (name: string) => cache(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (req: string | { url: string }) => {
      const key = typeof req === 'string' ? req : new URL(req.url).pathname;
      for (const m of store.values()) if (m.has(key)) return m.get(key);
      return undefined;
    },
  };
  let network: (req: unknown) => Promise<Response> = async () => new Response('x');
  const self = {
    location: { origin: 'https://meals.test' },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
  };
  vm.runInNewContext(readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8'), {
    self,
    caches,
    URL,
    Response,
    fetch: (req: unknown) => network(req),
  });

  const fetchEvent = (path: string, init: { method?: string; mode?: string } = {}) => {
    let answer: Promise<Response> | undefined;
    listeners.fetch({
      request: { url: `https://meals.test${path}`, method: init.method ?? 'GET', mode: init.mode ?? 'cors' },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    });
    return answer;
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    listeners,
    store,
    fetchEvent,
    settle,
    setNetwork: (fn: typeof network) => {
      network = fn;
    },
  };
}

const html = (headers: Record<string, string> = {}) =>
  new Response('<html></html>', { headers: { 'content-type': 'text/html', ...headers } });

describe('service worker', () => {
  it('never touches the API, MCP or OAuth endpoints', () => {
    const sw = load();
    for (const path of ['/api/stock', '/mcp', '/authorize', '/token', '/register', '/.well-known/oauth-authorization-server', '/sw.js']) {
      expect(sw.fetchEvent(path, { mode: 'navigate' })).toBeUndefined();
    }
    expect(sw.store.size).toBe(0);
  });

  it('ignores writes and other origins', () => {
    const sw = load();
    expect(sw.fetchEvent('/assets/a.js', { method: 'POST' })).toBeUndefined();
  });

  it('keeps the shell for offline use, and serves it when the network is down', async () => {
    const sw = load();
    sw.setNetwork(async () => html());
    await sw.fetchEvent('/stock', { mode: 'navigate' });
    await sw.settle();
    expect(sw.store.get('mealmcp-shell-v2')?.has('/')).toBe(true);

    sw.setNetwork(async () => {
      throw new Error('offline');
    });
    const offline = await sw.fetchEvent('/planning', { mode: 'navigate' });
    expect(await offline?.text()).toBe('<html></html>');
  });

  it('does not keep pages that say no-store or set a cookie', async () => {
    for (const headers of [{ 'cache-control': 'no-store' }, { 'cache-control': 'private' }]) {
      const sw = load();
      sw.setNetwork(async () => html(headers));
      await sw.fetchEvent('/', { mode: 'navigate' });
      await sw.settle();
      expect(sw.store.size).toBe(0);
    }
  });

  it('does not keep failed responses', async () => {
    const sw = load();
    sw.setNetwork(async () => new Response('nope', { status: 500 }));
    await sw.fetchEvent('/assets/app.js');
    await sw.settle();
    expect(sw.store.size).toBe(0);
  });

  it('caches hashed bundles and lets everything else go to the network', async () => {
    const sw = load();
    sw.setNetwork(async () => new Response('js', { headers: { 'content-type': 'text/javascript' } }));
    await sw.fetchEvent('/assets/app-abc.js');
    await sw.settle();
    expect(sw.store.get('mealmcp-shell-v2')?.has('/assets/app-abc.js')).toBe(true);
    expect(sw.fetchEvent('/icon.png')).toBeUndefined();
  });

  it('ignores clear requests that do not come from its own origin', async () => {
    const sw = load();
    sw.store.set('mealmcp-shell-v2', new Map());
    sw.listeners.message({ data: 'clear-caches', origin: 'https://evil.test', waitUntil: () => {} });
    await sw.settle();
    expect(sw.store.size).toBe(1);
  });

  it('wipes every cache when the page asks on sign-out, and old versions on activate', async () => {
    const sw = load();
    sw.store.set('old', new Map());
    sw.store.set('mealmcp-shell-v2', new Map());
    let pending: Promise<unknown> | undefined;
    sw.listeners.activate({
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect([...sw.store.keys()]).toEqual(['mealmcp-shell-v2']);

    sw.listeners.message({
      data: 'clear-caches',
      origin: 'https://meals.test',
      waitUntil: (p: Promise<unknown>) => {
        pending = p;
      },
    });
    await pending;
    expect(sw.store.size).toBe(0);
  });
});
