import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDb } from '../db/index.js';
import { makePdf } from '../services/testPdf.js';

let app: Server;
let llm: Server;
let base: string;
let llmDown = false;
let chatAnswer = '{"ok": true}';
const asked: { url: string; auth?: string; body?: string }[] = [];
const askedChat = () => asked.filter((a) => a.url === '/v1/chat/completions');

const listen = async (server: Server) => {
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  return (server.address() as AddressInfo).port;
};

beforeAll(async () => {
  // A fake model server: two models, answers JSON, and records what it was asked.
  llm = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      asked.push({ url: req.url ?? '', auth: req.headers.authorization, body });
      if (llmDown) return void req.socket.destroy();
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/models') return void res.end(JSON.stringify({ data: [{ id: 'llama3' }, { id: 'llava' }] }));
      if (req.url === '/v1/chat/completions') return void res.end(JSON.stringify({ choices: [{ message: { content: chatAnswer } }] }));
      res.statusCode = 404;
      res.end('{}');
    });
  });
  const llmPort = await listen(llm);
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((r) => probe.close(r));
  base = `http://localhost:${port}`;
  const config = loadConfig({
    PORT: String(port),
    PUBLIC_URL: base,
    LOG_LEVEL: 'silent',
    ALLOW_REGISTRATION: 'true',
    TRUST_PROXY: '1',
    LLM_BASE_URL: `http://127.0.0.1:${llmPort}/v1/`,
    LLM_API_KEY: 'sk-never-leave-the-server',
    LLM_MODEL: 'llama3',
  });
  app = createApp(createDb(':memory:'), config).listen(port);
  await new Promise((r) => app.once('listening', r));
});
afterAll(() => {
  app.close();
  llm.close();
});

let ipCounter = 0;
function browser() {
  const ip = `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
  let cookie = '';
  return {
    async call(path: string, init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {}) {
      const res = await fetch(`${base}${path}`, {
        method: init.method ?? (init.json !== undefined || init.body !== undefined ? 'POST' : 'GET'),
        headers: {
          'x-forwarded-for': ip,
          ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...init.headers,
        },
        body: init.body ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return res;
    },
  };
}
let n = 0;
async function signUp(extra: Record<string, unknown> = {}) {
  const b = browser();
  const res = await b.call('/api/auth/register', {
    json: { email: `ai${++n}@x.test`, name: `U${n}`, password: 'correct horse battery', ...extra },
  });
  expect(res.status).toBe(201);
  return b;
}

describe('AI routes', () => {
  it('needs a signed-in browser: anonymous gets 401, an access token gets 403', async () => {
    expect((await browser().call('/api/ai/status')).status).toBe(401);
    const owner = await signUp();
    const { token } = await (await owner.call('/api/tokens', { json: { name: 'script' } })).json();
    const bearer = { authorization: `Bearer ${token}` };
    const anon = browser();
    for (const [method, path] of [
      ['GET', '/api/ai/status'],
      ['GET', '/api/ai/models'],
      ['PUT', '/api/ai/model'],
      ['POST', '/api/ai/test'],
      ['POST', '/api/plan/week/ai'],
      ['POST', '/api/shopping/from-text/ai'],
      ['POST', '/api/shopping/receipt'],
    ] as const) {
      const res = await anon.call(path, { method, headers: bearer, json: method === 'GET' ? undefined : {} });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('answers no-store and never exposes the key or the server address', async () => {
    const b = await signUp();
    const res = await b.call('/api/ai/status');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = JSON.stringify([
      await res.json(),
      await (await b.call('/api/ai/models')).json(),
      await (await b.call('/api/settings')).json(),
    ]);
    expect(text).not.toContain('sk-never-leave');
    expect(text).not.toContain('127.0.0.1');
  });

  it('reports the default model and lists what the server offers', async () => {
    const b = await signUp();
    const status = await (await b.call('/api/ai/status')).json();
    expect(status).toMatchObject({ enabled: true, reachable: true, textModel: 'llama3', text: true });
    expect((await (await b.call('/api/ai/models')).json()).map((m: { id: string }) => m.id)).toEqual(['llama3', 'llava']);
    expect(asked.some((a) => a.url === '/v1/models' && a.auth === 'Bearer sk-never-leave-the-server')).toBe(true);
  });

  it('lets only the owner choose a model, from the listed ones', async () => {
    const owner = await signUp();
    const { code } = await (await owner.call('/api/household/invites', { json: {} })).json();
    const member = await signUp({ inviteCode: code });
    expect((await member.call('/api/ai/model', { method: 'PUT', json: { model: 'llava' } })).status).toBe(403);
    expect((await owner.call('/api/ai/model', { method: 'PUT', json: { model: 'typed-by-hand' } })).status).toBe(400);
    const ok = await owner.call('/api/ai/model', { method: 'PUT', json: { model: 'llava' } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).textModel).toBe('llava');
    // Every member uses the household's choice; clearing it goes back to the default.
    expect((await (await member.call('/api/ai/status')).json()).textModel).toBe('llava');
    await owner.call('/api/ai/model', { method: 'PUT', json: { model: null } });
    expect((await (await member.call('/api/ai/status')).json()).textModel).toBe('llama3');
  });

  it('keeps one household choice from reaching another', async () => {
    const a = await signUp();
    const other = await signUp();
    await a.call('/api/ai/model', { method: 'PUT', json: { model: 'llava' } });
    expect((await (await other.call('/api/ai/status')).json()).textModel).toBe('llama3');
  });

  it('cannot be set through the general settings route', async () => {
    const b = await signUp();
    await b.call('/api/settings', { method: 'PUT', json: { defaultServings: 3, ai: { model: 'llava' } } });
    const settings = await (await b.call('/api/settings')).json();
    expect(settings.defaultServings).toBe(3);
    expect(settings.ai).toBeUndefined();
  });

  it('tests the round trip, and a down server is a status, not a crash', async () => {
    const b = await signUp();
    const ok = await (await b.call('/api/ai/test', { json: {} })).json();
    expect(ok).toMatchObject({ reachable: true, model: true, json: true });
    llmDown = true;
    try {
      const status = await (await b.call('/api/ai/status')).json();
      expect(status.enabled).toBe(true);
      const test = await (await b.call('/api/ai/test', { json: {} })).json();
      expect(test).toMatchObject({ reachable: false, json: false });
    } finally {
      llmDown = false;
    }
  });

  it('limits how often a household can hit the model server', async () => {
    const b = await signUp();
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await b.call('/api/ai/models')).status;
    expect(last).toBe(429);
  });
});

describe('plan the week with AI', () => {
  const meals = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ date: `2031-03-${String(10 + i).padStart(2, '0')}`, mealType: 'dinner' }));

  it('answers at once, keeps working in the background, and a model that gives nothing usable leaves the rules plan', async () => {
    const b = await signUp();
    await b.call('/api/recipes', { json: { name: 'Soup', servings: 2, ingredients: [{ name: 'Leeks', quantity: 100, unit: 'g' }] } });
    const started = await b.call('/api/plan/week/ai', { json: { meals: meals(1), wishes: 'something light' } });
    expect(started.status).toBe(201);
    const plan = await started.json();
    expect(plan).toMatchObject({ source: 'llm' });
    expect(plan.slots[0].recipe.name).toBe('Soup');
    let current = plan;
    for (let i = 0; i < 50 && current.generating; i++) {
      await new Promise((r) => setTimeout(r, 50));
      current = await (await b.call(`/api/plan/week/${plan.id}`)).json();
    }
    expect(current.generating).toBe(false);
    expect(current.slots[0].recipe.name).toBe('Soup');
    // Another household sees nothing of it.
    expect((await (await signUp()).call(`/api/plan/week/${plan.id}`)).status).toBe(404);
  });

  it('rejects what is too big or malformed', async () => {
    const b = await signUp();
    expect((await b.call('/api/plan/week/ai', { json: { meals: meals(15) } })).status).toBe(400);
    expect((await b.call('/api/plan/week/ai', { json: { meals: meals(1), wishes: 'x'.repeat(501) } })).status).toBe(400);
    expect((await b.call('/api/plan/week/ai', { json: { meals: [] } })).status).toBe(400);
  });

  it('cannot be asked too often', async () => {
    const b = await signUp();
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) codes.push((await b.call('/api/plan/week/ai', { json: { meals: [] } })).status);
    expect(codes).toContain(429);
  });
});

describe('shopping from text with AI', () => {
  it('reads the sentences with the model, then answers like the typed list; bad input is a 400', async () => {
    const b = await signUp();
    // The fake model answers {"ok": true}: not a purchase list, so the person is told to try again or go without AI.
    const bad = await b.call('/api/shopping/from-text/ai', { json: { text: '2 kg rice' } });
    expect(bad.status).toBe(400);
    expect((await b.call('/api/shopping/from-text/ai', { json: { text: '' } })).status).toBe(400);
    const typed = await b.call('/api/shopping/from-text', { json: { text: '2 kg rice' } });
    expect(typed.status).toBe(200);
  });

  it('cannot be asked too often', async () => {
    const b = await signUp();
    const codes: number[] = [];
    for (let i = 0; i < 25; i++) codes.push((await b.call('/api/shopping/from-text/ai', { json: { text: '' } })).status);
    expect(codes).toContain(429);
  });
});

describe('receipts', () => {
  const receipt = (b: Awaited<ReturnType<typeof signUp>>, body: BodyInit, type: string) =>
    b.call('/api/shopping/receipt', { method: 'POST', body, headers: { 'content-type': type } });
  const answer = { lines: [{ name: 'Rice', quantity: 2, unit: 'kg', price: 3.1 }], total: 3.1, store: 'Shop' };

  it('reads a digital PDF through its text layer, then a picture, and keeps nothing', async () => {
    const b = await signUp();
    chatAnswer = JSON.stringify(answer);
    try {
      const pdf = await receipt(b, makePdf('RICE 2KG 3.10 EUR TOTAL 3.10 EUR'), 'application/pdf');
      expect(pdf.status).toBe(200);
      expect(await pdf.json()).toMatchObject({ total: 3.1, store: 'Shop', lines: [{ name: 'Rice', quantity: 2, match: 'new' }] });
      const asked = JSON.parse(`${askedChat().at(-1)?.body}`);
      expect(JSON.stringify(asked.messages)).toContain('RICE 2KG');
      const jpeg = await receipt(b, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'image/jpeg');
      expect(jpeg.status).toBe(200);
      const photo = JSON.parse(`${askedChat().at(-1)?.body}`);
      expect(JSON.stringify(photo.messages)).toContain('data:image/jpeg;base64,');
      expect(await (await b.call('/api/stock')).json()).toHaveLength(0);
    } finally {
      chatAnswer = '{"ok": true}';
    }
  });

  it('says a scanned PDF is a scan, and refuses other files, lies about the type and empty bodies', async () => {
    const b = await signUp();
    const scan = await receipt(b, makePdf(''), 'application/pdf');
    expect(scan.status).toBe(422);
    expect(await scan.json()).toMatchObject({ scan: true });
    expect((await receipt(b, Buffer.from('MZ an executable program'), 'application/pdf')).status).toBe(400);
    expect((await receipt(b, makePdf('RICE 2KG 3.10 EUR TOTAL'), 'image/jpeg')).status).toBe(400);
    expect((await receipt(b, Buffer.alloc(0), 'application/pdf')).status).toBe(400);
    expect((await receipt(b, 'text', 'text/plain')).status).toBe(400);
  });

  it('is for a signed-in browser, and a file that is too big is refused', async () => {
    expect((await receipt(browser(), makePdf('x'), 'application/pdf')).status).toBe(401);
    const b = await signUp();
    const big = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(9 * 1024 * 1024)]);
    expect((await receipt(b, big, 'application/pdf')).status).toBe(413);
  });
});

describe('without an AI server', () => {
  it('is simply off', async () => {
    const probe = createServer();
    const port = await listen(probe);
    await new Promise((r) => probe.close(r));
    const off = createApp(
      createDb(':memory:'),
      loadConfig({ PORT: String(port), PUBLIC_URL: `http://localhost:${port}`, LOG_LEVEL: 'silent', ALLOW_REGISTRATION: 'true' }),
    ).listen(port);
    await new Promise((r) => off.once('listening', r));
    try {
      const reg = await fetch(`http://localhost:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'off@x.test', name: 'Off', password: 'correct horse battery' }),
      });
      const cookie = reg.headers.get('set-cookie')?.split(';')[0] ?? '';
      const status = await (await fetch(`http://localhost:${port}/api/ai/status`, { headers: { cookie } })).json();
      expect(status).toMatchObject({ enabled: false, reachable: false, text: false });
      const plan = await fetch(`http://localhost:${port}/api/plan/week/ai`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ meals: [{ date: '2031-03-10', mealType: 'dinner' }] }),
      });
      expect(plan.status).toBe(400);
      const buy = await fetch(`http://localhost:${port}/api/shopping/from-text/ai`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ text: '2 kg rice' }),
      });
      expect(buy.status).toBe(400);
      expect(await (await fetch(`http://localhost:${port}/api/ai/models`, { headers: { cookie } })).json()).toEqual([]);
    } finally {
      off.close();
    }
  });
});
