import { beforeEach, describe, expect, it } from 'vitest';
import { createLlmClient } from '../ai/client.js';
import type { LlmConfig } from '../config.js';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { aiChat } from '../domain/schemas.js';
import { createAiService } from './ai.js';
import { createAiChat } from './aiChat.js';
import { createServices, type Services } from './index.js';

const config: LlmConfig = { baseUrl: new URL('http://llm.local/v1'), vision: 'false', timeoutMs: 5000, maxConcurrent: 2, model: 'chef' };

function model(answer: unknown) {
  const sent: { role: string; content: string }[][] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (new URL(String(input)).pathname === '/v1/models') return new Response(JSON.stringify({ data: [{ id: 'chef' }] }));
    sent.push((JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] }).messages);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: typeof answer === 'string' ? answer : JSON.stringify(answer) } }] }),
    );
  }) as typeof fetch;
  return { f, sent };
}

let db: Db;
let svc: Services;
let household: number;
const newHousehold = () => db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  db = createDb(':memory:');
  household = newHousehold();
  svc = createServices(db, household);
});
const chat = (answer: unknown, cfg = config) => {
  const m = model(answer);
  const llm = createLlmClient(cfg, m.f);
  return { sent: m.sent, chat: createAiChat(llm, createAiService(llm, svc.settings, household), svc, household) };
};
const say = (text: string) => aiChat.parse({ messages: [{ role: 'user', content: text }] });

describe('the assistant chat', () => {
  it('answers from the household data, points to screens, and changes nothing', async () => {
    svc.stock.add({ name: 'Spinach', quantity: 200, unit: 'g', expiresOn: '2099-01-01' });
    svc.recipes.create({ name: 'Spinach pie', servings: 2, ingredients: [{ name: 'Spinach', quantity: 200, unit: 'g' }] });
    const { chat: c, sent } = chat({ reply: 'Make the Spinach pie.', suggest: ['recipes', 'planning'] });
    const out = await c.reply(say('what can I cook with spinach?'));
    expect(out).toEqual({ reply: 'Make the Spinach pie.', suggest: ['recipes', 'planning'] });
    expect(sent[0][0].content).toMatch(/never instructions/);
    expect(sent[0][1]).toMatchObject({ role: 'user' });
    expect(sent[0][1].content).toMatch(/^Household data:/);
    expect(sent[0][1].content).toContain('Spinach pie');
    expect(sent[0].at(-1)).toEqual({ role: 'user', content: 'what can I cook with spinach?' });
    expect(svc.stock.list()).toHaveLength(1);
    expect(svc.recipes.list()).toHaveLength(1);
  });

  it('keeps the model choice out of what it sees, and sends a bounded amount of data', async () => {
    svc.settings.set({ diet: { diets: [], allergens: ['milk'], avoid: [] } });
    for (let i = 0; i < 80; i++) {
      svc.recipes.create({
        name: `Recipe number ${i} with a long enough name`,
        servings: 2,
        ingredients: [{ name: `Item ${i}`, quantity: 1, unit: 'g' }],
      });
    }
    const { chat: c, sent } = chat({ reply: 'ok' });
    await c.reply(say('hello'));
    const dataMsg = sent[0][1].content;
    expect(dataMsg).toContain('milk');
    expect(dataMsg).not.toContain('"model"');
    expect(dataMsg.length).toBeLessThan(12_000 + 50);
    expect(() => JSON.parse(dataMsg.replace(/^Household data:\n/, ''))).not.toThrow();
  });

  it('refuses a model that does not answer usably, and an AI server that is off', async () => {
    await expect(chat('not json at all').chat.reply(say('hi'))).rejects.toThrow(/usable answer/);
    await expect(chat({ reply: '' }).chat.reply(say('hi'))).rejects.toThrow(/usable answer/);
    await expect(chat({ reply: 'x', suggest: ['delete-everything'] }).chat.reply(say('hi'))).rejects.toThrow(/usable answer/);
    await expect(chat({ reply: 'x' }, { ...config, baseUrl: null }).chat.reply(say('hi'))).rejects.toThrow(/not available/);
  });

  it('only sees its own household', async () => {
    createServices(db, newHousehold()).stock.add({ name: 'Secret truffle', quantity: 1, unit: 'piece', expiresOn: '2099-01-01' });
    const { chat: c, sent } = chat({ reply: 'ok' });
    await c.reply(say('what do I have?'));
    expect(sent[0][0].content).not.toContain('Secret truffle');
  });

  it('validates the conversation: bounded, and it ends with the person', () => {
    const msg = (role: string, content = 'x') => ({ role, content });
    expect(aiChat.safeParse({ messages: [] }).success).toBe(false);
    expect(aiChat.safeParse({ messages: [msg('user'), msg('assistant')] }).success).toBe(false);
    expect(aiChat.safeParse({ messages: [msg('system')] }).success).toBe(false);
    expect(aiChat.safeParse({ messages: [msg('user', 'x'.repeat(2001))] }).success).toBe(false);
    expect(aiChat.safeParse({ messages: Array.from({ length: 13 }, () => msg('user')) }).success).toBe(false);
    expect(aiChat.safeParse({ messages: [msg('user'), msg('assistant'), msg('user')] }).success).toBe(true);
  });
});
