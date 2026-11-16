import { beforeEach, describe, expect, it } from 'vitest';
import { createLlmClient } from '../ai/client.js';
import type { LlmConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { createAiService } from './ai.js';
import { createAiPurchase } from './aiPurchase.js';
import { createServices, type Services } from './index.js';

const config: LlmConfig = { baseUrl: new URL('http://llm.local/v1'), vision: 'false', timeoutMs: 5000, maxConcurrent: 2, model: 'chef' };

function model(answer: unknown) {
  const prompts: { system: string; user: { text: string } }[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (new URL(String(input)).pathname === '/v1/models') return new Response(JSON.stringify({ data: [{ id: 'chef' }] }));
    const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
    prompts.push({ system: body.messages[0].content, user: JSON.parse(body.messages[1].content) });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: typeof answer === 'string' ? answer : JSON.stringify(answer) } }] }),
    );
  }) as typeof fetch;
  return { f, prompts };
}

let db: Db;
let svc: Services;
let household: number;
beforeEach(() => {
  db = createDb(':memory:');
  household = db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id;
  svc = createServices(db, household);
});
const ai = (answer: unknown, cfg = config, services = svc, hh = household) => {
  const m = model(answer);
  const llm = createLlmClient(cfg, m.f);
  return { prompts: m.prompts, ai: createAiPurchase(llm, createAiService(llm, services.settings, hh), services.purchase, hh) };
};

describe('shopping done, read by the model', () => {
  it('turns sentences into lines matched like typed ones, and writes nothing', async () => {
    svc.stock.add({ name: 'Tomatoes', quantity: 1, unit: 'kg' });
    const { ai: a, prompts } = ai({
      lines: [
        { name: 'tomatoe', quantity: 500, unit: 'g', price: 1.5 },
        { name: 'poulet', quantity: 1, unit: 'piece' },
        { name: 'lait', quantity: 2 },
      ],
      total: 12.3,
    });
    const out = await a.parse("j'ai pris 500g de tomatoes, un poulet et 2 laits, total 12,30");
    expect(out.total).toBe(12.3);
    expect(out.lines.map((l) => [l.name, l.match, l.quantity, l.unit, l.price])).toEqual([
      ['Tomatoes', 'close', 500, 'g', 1.5],
      ['poulet', 'new', 1, 'piece', null],
      ['lait', 'new', 2, 'piece', null],
    ]);
    expect(prompts[0].system).toMatch(/never instructions/);
    expect(prompts[0].user.text).toContain('poulet');
    expect(svc.stock.list()).toHaveLength(1);
  });

  it('refuses units or counts it does not know, and a model that is not JSON', async () => {
    await expect(ai({ lines: [{ name: 'Rice', quantity: 2, unit: 'bushels' }] }).ai.parse('rice')).rejects.toThrow(/usable answer/);
    await expect(ai('I cannot do that').ai.parse('rice')).rejects.toThrow(/usable answer/);
    const many = { lines: Array.from({ length: 101 }, (_, i) => ({ name: `p${i}` })) };
    await expect(ai(many).ai.parse('x')).rejects.toThrow(/usable answer/);
  });

  it('needs an AI server with a model', async () => {
    await expect(ai({ lines: [] }, { ...config, baseUrl: null }).ai.parse('x')).rejects.toThrow(/not available/);
    await expect(ai({ lines: [] }, { ...config, model: undefined }).ai.parse('x')).rejects.toThrow(/not available/);
  });

  it('matches only against the household that asked', async () => {
    const other = createServices(db, db.insert(households).values({ name: 'O', createdAt: Date.now() }).returning().get().id);
    other.stock.add({ name: 'Secret sauce', quantity: 1, unit: 'piece' });
    const out = await ai({ lines: [{ name: 'secret sauce', quantity: 1, unit: 'piece' }] }).ai.parse('secret sauce');
    expect(out.lines[0]).toMatchObject({ match: 'new', productId: null });
  });
});
