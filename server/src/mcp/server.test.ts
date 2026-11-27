import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../db/index.js';
import { households } from '../db/schema.js';
import { createServices, type Services } from '../services/index.js';
import { createMcpServer } from './server.js';

let svc: Services;
let client: Client;

beforeEach(async () => {
  const db = createDb(':memory:');
  const household = db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id;
  svc = createServices(db, household);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(svc).connect(serverSide);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
});

const call = async (name: string, args: Record<string, unknown>) => {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: !!res.isError, text: res.content[0].text };
};

describe('MCP tools', () => {
  it('rejects an unknown field instead of ignoring it', async () => {
    const recipe = svc.recipes.create({ name: 'Soup', servings: 2, ingredients: [] });
    const res = await call('update_recipe', { id: recipe.id, instructions: ['Boil water'] });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('instructions');
    expect(svc.recipes.get(recipe.id).steps).toEqual([]);
  });

  it('advertises closed input schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'update_recipe')?.inputSchema.additionalProperties).toBe(false);
  });

  it('says when a recipe has no steps', async () => {
    const recipe = svc.recipes.create({ name: 'Soup', servings: 2, ingredients: [] });
    expect(JSON.parse((await call('get_recipe', { id: recipe.id })).text).notice).toMatch(/no steps/);
    svc.recipes.update({ id: recipe.id, steps: [{ text: 'Boil water' }] });
    expect(JSON.parse((await call('get_recipe', { id: recipe.id })).text).notice).toBeUndefined();
  });
});
