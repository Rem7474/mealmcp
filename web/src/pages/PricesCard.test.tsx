import { screen, within } from '@testing-library/react';
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
