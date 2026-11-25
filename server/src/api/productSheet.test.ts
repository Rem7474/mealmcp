import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp } from './testApp.js';

let app: Awaited<ReturnType<typeof startTestApp>>;
beforeAll(async () => (app = await startTestApp()));
afterAll(() => app.close());

describe('product sheet over HTTP', () => {
  it('reads one product with its stock and prices, and keeps households apart', async () => {
    const a = await app.signUp();
    const b = await app.signUp();
    await a('/api/stock', 'POST', { name: 'Rice', quantity: 2, unit: 'kg' });
    const [rice] = (await (await a('/api/products')).json()) as { id: number }[];
    const res = await a(`/api/products/${rice!.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ product: { name: 'Rice' }, stock: { total: 2000, unit: 'g' }, price: { count: 0 } });
    expect((await b(`/api/products/${rice!.id}`)).status).toBe(404);
    expect((await a('/api/products/abc')).status).toBe(400);
  });
});
