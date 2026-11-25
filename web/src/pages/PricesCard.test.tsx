import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { PriceOverview, Product } from '../types';
import { PricesCard } from './PricesCard';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

const product = (id: number, name: string, extra: Partial<Product> = {}): Product => ({
  id,
  name,
  category: null,
  defaultUnit: 'g',
  minStock: null,
  unitPrice: 1.19,
  priceUnit: 'g',
  pricePer: { main: { cents: 1190, per: 'kg' }, alt: null },
  isStaple: false,
  gramsPerPiece: null,
  gramsPerMl: null,
  suggestedCategory: null,
  drainedRatio: null,
  openedShelfLifeDays: null,
  frozenShelfLifeDays: null,
  thawedShelfLifeDays: null,
  brand: null,
  barcode: null,
  barcodes: [],
  aliases: [],
  nutrition: null,
  ...extra,
});

const overview = (productId: number, extra: Partial<PriceOverview> = {}): PriceOverview => ({
  productId,
  name: '',
  per: 'kg',
  latestCents: 1190,
  averageCents: 1000,
  trend: 'up',
  high: false,
  cheapestStore: null,
  count: 3,
  ...extra,
});

const me = {
  status: 200,
  body: { user: { id: 1, email: 'a@b.c', name: 'A', role: 'owner', householdId: 1, householdName: 'H', currency: 'EUR' } },
};

describe('PricesCard', () => {
  it('lists every priced product by name, sorted, with what its history says', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /products': {
        status: 200,
        body: [
          product(2, 'Zucchini'),
          product(1, 'Apples', { pricePer: { main: { cents: 1190, per: 'kg' }, alt: { cents: 150, per: 'piece' } } }),
          product(3, 'Unpriced', { unitPrice: null, priceUnit: null, pricePer: null }),
        ],
      },
      'GET /prices': {
        status: 200,
        body: [overview(1, { high: true, cheapestStore: 'Lidl' }), overview(2, { trend: null, count: 1 })],
      },
    });
    renderApp(<PricesCard currency="EUR" />);

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Apples' })).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'Zucchini' })).toBeInTheDocument();
    // Apples: average (needs several observations), cheapest shop, the pricey flag and the same price in pieces.
    const first = within(rows[0] as HTMLElement);
    await first.findByText('Pricey');
    expect(first.getByText(/Average:/)).toBeInTheDocument();
    expect(first.getByText('Cheapest at Lidl')).toBeInTheDocument();
    expect(first.getByText(/1\.50.*piece/)).toBeInTheDocument();
    // Zucchini has a single observation: no average to show.
    expect(within(rows[1] as HTMLElement).queryByText(/Average:/)).toBeNull();
    expect(screen.queryByText('Unpriced')).toBeNull();
  });

  it('filters the list by name', async () => {
    mockApi({
      'GET /auth/me': me,
      'GET /products': { status: 200, body: [product(1, 'Apples'), product(2, 'Pears')] },
      'GET /prices': { status: 200, body: [] },
    });
    renderApp(<PricesCard currency="EUR" />);
    await screen.findByRole('button', { name: 'Apples' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter the prices' }), 'pea');
    expect(screen.queryByRole('button', { name: 'Apples' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pears' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter the prices' }), 'zzz');
    expect(screen.getByText('No product matches.')).toBeInTheDocument();
  });

  it('shows the unit a typed product will default to and posts the price paid for a quantity', async () => {
    const { calls } = mockApi({
      'GET /auth/me': me,
      'GET /products': { status: 200, body: [product(1, 'Milk', { defaultUnit: 'ml' })] },
      'GET /prices': { status: 200, body: [] },
      'POST /products/price': { status: 200, body: {} },
    });
    renderApp(<PricesCard currency="EUR" />);
    await screen.findByRole('button', { name: 'Milk' });

    await userEvent.type(screen.getByLabelText('Product'), 'milk');
    expect(screen.getByLabelText('Unit')).toHaveAttribute('placeholder', 'ml');
    await userEvent.type(screen.getByLabelText('Price (€)'), '0,95');
    await userEvent.clear(screen.getByLabelText('Paid for'));
    await userEvent.type(screen.getByLabelText('Paid for'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Add a price' }));

    expect(calls.find((c) => c.method === 'POST' && c.path === '/products/price')?.body).toEqual({
      name: 'milk',
      price: 0.95,
      quantity: 1000,
    });
  });
});

describe('PricesCard corrections', () => {
  const routes = (products: Product[], extra: Parameters<typeof mockApi>[0] = {}) =>
    mockApi({
      'GET /auth/me': me,
      'GET /products': { status: 200, body: products },
      'GET /prices': { status: 200, body: [] },
      'POST /products/price': { status: 200, body: {} },
      ...extra,
    });
  const posts = (calls: { method: string; path: string; body: unknown }[]) =>
    calls.filter((c) => c.method === 'POST' && c.path === '/products/price').map((c) => c.body);

  it('shows prices per kg, litre or piece and saves a corrected one in that unit', async () => {
    const { calls } = routes([
      product(1, 'Apples'),
      product(2, 'Milk', { defaultUnit: 'ml', priceUnit: 'ml', unitPrice: 0.095 }),
      product(3, 'Eggs', { defaultUnit: 'piece', priceUnit: 'piece', unitPrice: 30 }),
    ]);
    renderApp(<PricesCard currency="EUR" />);
    const apples = await screen.findByRole('textbox', { name: 'Price of Apples per kg' });
    expect(apples).toHaveValue('11.90');
    expect(screen.getByRole('textbox', { name: 'Price of Milk per l' })).toHaveValue('0.95');
    const eggs = screen.getByRole('textbox', { name: 'Price of Eggs per piece' });
    expect(eggs).toHaveValue('0.30');
    expect(screen.getByText('€/1')).toBeInTheDocument();

    // Leaving the field unchanged, or with something that is not a price, sends nothing.
    await userEvent.click(apples);
    await userEvent.tab();
    await userEvent.clear(eggs);
    await userEvent.type(eggs, 'abc{Enter}');
    expect(posts(calls)).toEqual([]);

    await userEvent.clear(apples);
    await userEvent.type(apples, '12,50{Enter}');
    await waitFor(() => expect(posts(calls)).toEqual([{ name: 'Apples', price: 12.5, quantity: 1, unit: 'kg' }]));
  });

  it('says when nothing is priced yet', async () => {
    routes([product(1, 'Salt', { unitPrice: null, priceUnit: null, pricePer: null })]);
    renderApp(<PricesCard currency="EUR" />);
    expect(await screen.findByText('No product has a price yet.')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('refuses a negative price or an empty quantity, sends the unit typed and clears the form', async () => {
    const { calls } = routes([]);
    renderApp(<PricesCard currency="EUR" />);
    await screen.findByText('No product has a price yet.');

    await userEvent.type(screen.getByLabelText('Product'), 'Saffron');
    await userEvent.type(screen.getByLabelText('Price (€)'), '-3');
    await userEvent.click(screen.getByRole('button', { name: 'Add a price' }));
    await userEvent.clear(screen.getByLabelText('Price (€)'));
    await userEvent.type(screen.getByLabelText('Price (€)'), '6');
    await userEvent.clear(screen.getByLabelText('Paid for'));
    await userEvent.type(screen.getByLabelText('Paid for'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Add a price' }));
    expect(posts(calls)).toEqual([]);

    await userEvent.clear(screen.getByLabelText('Paid for'));
    await userEvent.type(screen.getByLabelText('Paid for'), '2');
    await userEvent.type(screen.getByLabelText('Unit'), ' g ');
    await userEvent.click(screen.getByRole('button', { name: 'Add a price' }));
    await waitFor(() => expect(posts(calls)).toEqual([{ name: 'Saffron', price: 6, quantity: 2, unit: 'g' }]));
    await waitFor(() => expect(screen.getByLabelText('Product')).toHaveValue(''));
    expect(screen.getByLabelText('Paid for')).toHaveValue('1');
  });

  it('opens the product sheet from its name', async () => {
    routes([product(1, 'Apples')], {
      'GET /products/1/prices': {
        status: 200,
        body: {
          productId: 1,
          name: 'Apples',
          per: 'kg',
          latestCents: 1190,
          averageCents: 1190,
          minCents: 1190,
          maxCents: 1190,
          trend: null,
          count: 1,
          alternative: null,
          byStore: [],
          cheapestStore: null,
          high: false,
          freeform: null,
          observations: [],
        },
      },
    });
    renderApp(<PricesCard currency="EUR" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Apples' }));
    const sheet = await screen.findByRole('dialog', { name: 'Apples' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
