import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LlmConfig } from '../config.js';
import { AiError, createLlmClient, extractJson } from './client.js';

const config = (over: Partial<LlmConfig> = {}): LlmConfig => ({
  baseUrl: new URL('http://llm.local:11434/v1'),
  vision: 'auto',
  timeoutMs: 5000,
  maxConcurrent: 2,
  ...over,
});

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;
/** A scripted server: the method and path map to a handler; anything else is a 404. */
function fake(routes: Record<string, Handler>) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    seen.push({ url: url.href, init });
    const route = routes[`${init.method ?? 'GET'} ${url.pathname}`];
    if (!route) return new Response('{}', { status: 404 });
    const out = await route(url, init);
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200 });
  }) as typeof fetch;
  return { f, seen };
}
const reply = (content: string) => ({ body: { choices: [{ message: { content } }] } });

describe('extractJson', () => {
  it('reads plain, fenced and wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
    expect(extractJson('Sure! {"a":1} Hope it helps')).toEqual({ a: 1 });
    expect(extractJson('[1,2]')).toEqual([1, 2]);
  });
  it('refuses text that holds no JSON', () => {
    expect(() => extractJson('no json here')).toThrow(AiError);
    expect(() => extractJson('{"a": ')).toThrow(AiError);
  });
});

describe('listing models', () => {
  it('reads /v1/models and sends the key as a bearer token', async () => {
    const { f, seen } = fake({ 'GET /v1/models': () => ({ body: { data: [{ id: 'llama3' }, { id: 'llava' }, { nope: 1 }] } }) });
    const llm = createLlmClient(config({ apiKey: 'sk-secret' }), f);
    expect(await llm.listIds()).toEqual(['llama3', 'llava']);
    expect(new Headers(seen[0]?.init.headers).get('authorization')).toBe('Bearer sk-secret');
    expect(seen[0]?.init.redirect).toBe('error');
  });

  it('is off without an address and never calls out', async () => {
    const { f, seen } = fake({});
    const llm = createLlmClient(config({ baseUrl: null }), f);
    expect(llm.enabled).toBe(false);
    await expect(llm.listIds()).rejects.toThrow(AiError);
    expect(seen).toEqual([]);
  });

  it('turns a network failure, a timeout and an HTTP error into safe messages', async () => {
    const down = createLlmClient(config(), (async () => {
      throw new TypeError('connect ECONNREFUSED 10.1.2.3:11434');
    }) as typeof fetch);
    await expect(down.listIds()).rejects.toThrow('The AI server cannot be reached');
    const slow = createLlmClient(config(), (async () => {
      throw Object.assign(new Error('x'), { name: 'TimeoutError' });
    }) as typeof fetch);
    await expect(slow.listIds()).rejects.toThrow('took too long');
    const bad = createLlmClient(config(), fake({ 'GET /v1/models': () => ({ status: 500 }) }).f);
    await expect(bad.listIds()).rejects.toThrow('error (500)');
  });

  it('keeps the list for a moment', async () => {
    const { f, seen } = fake({ 'GET /v1/models': () => ({ body: { data: [{ id: 'm' }] } }) });
    const llm = createLlmClient(config({ vision: 'false' }), f);
    await llm.cachedModels();
    await llm.cachedModels();
    expect(seen.filter((s) => s.url.endsWith('/v1/models'))).toHaveLength(1);
  });
});

describe('vision detection', () => {
  it('reads Ollama capabilities', async () => {
    const llm = createLlmClient(config(), fake({ 'POST /api/show': () => ({ body: { capabilities: ['completion', 'vision'] } }) }).f);
    expect(await llm.visionOf('llava')).toBe('yes');
    const text = createLlmClient(config(), fake({ 'POST /api/show': () => ({ body: { capabilities: ['completion'] } }) }).f);
    expect(await text.visionOf('llama3')).toBe('no');
  });

  it('reads LM Studio model types', async () => {
    const data = [
      { id: 'a', type: 'llm' },
      { id: 'b', type: 'vlm' },
    ];
    const llm = createLlmClient(config(), fake({ 'GET /api/v0/models': () => ({ body: { data } }) }).f);
    expect(await llm.visionOf('b')).toBe('yes');
    expect(await llm.visionOf('a')).toBe('no');
  });

  it('reads llama.cpp modalities', async () => {
    const llm = createLlmClient(config(), fake({ 'GET /props': () => ({ body: { modalities: { vision: true } } }) }).f);
    expect(await llm.visionOf('any')).toBe('yes');
  });

  it('says unknown for a server it does not recognise, and lets the setting override', async () => {
    const { f } = fake({});
    expect(await createLlmClient(config(), f).visionOf('m')).toBe('unknown');
    expect(await createLlmClient(config({ vision: 'true' }), f).visionOf('m')).toBe('yes');
    expect(await createLlmClient(config({ vision: 'false' }), f).visionOf('m')).toBe('no');
  });
});

describe('chat and JSON', () => {
  it('sends images as data URLs and asks for JSON mode only when told', async () => {
    const { f, seen } = fake({ 'POST /v1/chat/completions': () => reply('ok') });
    const llm = createLlmClient(config(), f);
    await llm.chat({
      household: 1,
      model: 'llava',
      messages: [{ role: 'user', content: 'what?', images: ['data:image/png;base64,AAA'] }],
      json: true,
    });
    const body = JSON.parse(String(seen[0]?.init.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'what?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ]);
    await llm.chat({ household: 1, model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(JSON.parse(String(seen[1]?.init.body)).response_format).toBeUndefined();
  });

  it('retries once with the problem spelled out, then returns valid data', async () => {
    const answers = ['{"n":"two"}', '```json\n{"n":2}\n```'];
    const { f, seen } = fake({ 'POST /v1/chat/completions': () => reply(answers.shift() as string) });
    const llm = createLlmClient(config(), f);
    const out = await llm.json({ household: 1, model: 'm', messages: [{ role: 'user', content: 'go' }] }, z.object({ n: z.number() }));
    expect(out).toEqual({ n: 2 });
    const second = JSON.parse(String(seen[1]?.init.body));
    expect(second.messages.at(-1).content).toContain('n:');
  });

  it('gives up after the second bad answer instead of returning half-valid data', async () => {
    const { f } = fake({ 'POST /v1/chat/completions': () => reply('{"n":"x"}') });
    const llm = createLlmClient(config(), f);
    await expect(llm.json({ household: 1, model: 'm', messages: [] }, z.object({ n: z.number() }))).rejects.toThrow('usable answer');
  });

  it('refuses an empty answer', async () => {
    const llm = createLlmClient(config(), fake({ 'POST /v1/chat/completions': () => reply('  ') }).f);
    await expect(llm.chat({ household: 1, model: 'm', messages: [] })).rejects.toThrow('empty answer');
  });

  it('runs one job per household and queues beyond the global cap', async () => {
    let running = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const { f } = fake({
      'POST /v1/chat/completions': async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise<void>((r) => gates.push(r));
        running--;
        return reply('ok');
      },
    });
    const llm = createLlmClient(config({ maxConcurrent: 2 }), f);
    const job = (household: number) => llm.chat({ household, model: 'm', messages: [] });
    const a = job(1);
    await expect(job(1)).rejects.toThrow('already running');
    const b = job(2);
    const c = job(3);
    await new Promise((r) => setTimeout(r, 20));
    expect(peak).toBe(2);
    while (gates.length) gates.shift()?.();
    await new Promise((r) => setTimeout(r, 20));
    while (gates.length) gates.shift()?.();
    await Promise.all([a, b, c]);
    expect(peak).toBe(2);
  });
});
