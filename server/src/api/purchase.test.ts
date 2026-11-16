import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './testApp.js';

let app: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (app = await startTestApp()));
afterAll(() => app.close());
const signUp = () => app.signUp();

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
