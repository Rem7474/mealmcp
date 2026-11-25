import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { Product, User } from '../types';
import { Account } from './Account';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

const user: User = { id: 1, email: 'a@b.c', name: 'Alex', role: 'owner', householdId: 1, householdName: 'Home', currency: 'EUR' };

const product: Product = {
  id: 4,
  name: 'Yoghurt',
  category: null,
  defaultUnit: 'g',
  minStock: null,
  unitPrice: null,
  priceUnit: null,
  pricePer: null,
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
  aliases: ['Yogurt'],
  nutrition: null,
};

describe('Account products', () => {
  it('files a product under the aisle that was picked', async () => {
    const { calls } = mockApi({
      'GET /auth/me': { status: 200, body: { user } },
      'GET /products': { status: 200, body: [product] },
      'PATCH /products/4': { status: 200, body: {} },
    });
    renderApp(<Account user={user} />);
    await screen.findByRole('button', { name: 'Yoghurt' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Aisle' }), 'dairy');
    // The aisle chosen is sent, not the one the select still shows while the request is built.
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ category: 'dairy' }));
  });
});
