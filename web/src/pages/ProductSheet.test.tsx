import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { Product } from '../types';
import { ProductSheet } from './ProductSheet';

const product: Product = {
  id: 7,
  name: 'Chickpeas',
  category: 'pantry',
  defaultUnit: 'g',
  minStock: 200,
  unitPrice: null,
  priceUnit: null,
  pricePer: null,
  isStaple: false,
  gramsPerPiece: null,
  gramsPerMl: null,
  suggestedCategory: 'pantry',
  drainedRatio: 0.625,
  openedShelfLifeDays: 3,
  frozenShelfLifeDays: null,
  thawedShelfLifeDays: null,
  brand: null,
  barcode: null,
  barcodes: [],
  aliases: ['Garbanzo'],
  nutrition: null,
};

describe('ProductSheet', () => {
  it('saves unified product settings and allows setting a first price on an unpriced product', async () => {
    const { calls } = mockApi({
      'GET /auth/me': {
        status: 200,
        body: {
          user: { id: 1, email: 'a@b.c', name: 'A', role: 'owner', householdId: 1, householdName: 'H', currency: 'EUR' },
          registrationOpen: false,
        },
      },
      'GET /products/7/prices': {
        status: 200,
        body: {
          productId: 7,
          name: 'Chickpeas',
          per: null,
          latestCents: null,
          averageCents: null,
          minCents: null,
          maxCents: null,
          trend: null,
          count: 0,
          alternative: null,
          byStore: [],
          cheapestStore: null,
          high: false,
          freeform: null,
          observations: [],
        },
      },
      'PATCH /products/7': { status: 200, body: product },
      'POST /products/price': { status: 200, body: product },
    });

    let closed = false;
    renderApp(
      <ProductSheet
        product={product}
        onClose={() => {
          closed = true;
        }}
      />,
    );

    await userEvent.type(screen.getByLabelText('Brand'), 'Bonduelle');
    await userEvent.click(screen.getByLabelText('Always at home'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const patch = calls.find((c) => c.method === 'PATCH' && c.path === '/products/7')?.body as Record<string, unknown>;
    expect(patch).toMatchObject({ brand: 'Bonduelle', staple: true, category: 'pantry', minStock: 200, openedShelfLifeDays: 3 });
    expect(closed).toBe(true);

    await userEvent.type(screen.getByPlaceholderText('0.00'), '2,50');
    await userEvent.click(screen.getByRole('button', { name: 'Set price' }));
    const priceCall = calls.find((c) => c.method === 'POST' && c.path === '/products/price')?.body as Record<string, unknown>;
    expect(priceCall).toMatchObject({ name: 'Chickpeas', price: 2.5, quantity: 1, unit: 'g' });
  });
});
