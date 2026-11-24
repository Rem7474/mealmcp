import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { ShoppingItem } from '../types';
import { Shopping } from './Shopping';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
  // jsdom has no matchMedia, which the folding cards read.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

const item = (id: number, name: string): ShoppingItem => ({
  id,
  productId: id,
  name,
  category: null,
  quantity: 1,
  unit: 'kg',
  checked: false,
  source: 'manual',
  priceCents: null,
  estimatedCents: null,
  needed: null,
  packSize: null,
  packs: null,
  surplus: 0,
  location: null,
  storeIn: 'pantry',
  pricePer: null,
  meals: [],
  season: null,
  seasonAlternatives: [],
});

describe('Shopping price flag', () => {
  it('flags only the lines whose latest price is well above the usual one', async () => {
    mockApi({
      'GET /shopping': { status: 200, body: [item(1, 'Butter'), item(2, 'Flour')] },
      'GET /prices': {
        status: 200,
        body: [
          {
            productId: 1,
            name: 'Butter',
            per: 'kg',
            latestCents: 900,
            averageCents: 700,
            trend: 'up',
            high: true,
            cheapestStore: null,
            count: 3,
          },
          {
            productId: 2,
            name: 'Flour',
            per: 'kg',
            latestCents: 100,
            averageCents: 100,
            trend: 'stable',
            high: false,
            cheapestStore: null,
            count: 3,
          },
        ],
      },
    });
    renderApp(<Shopping />);
    expect(await screen.findByText('Butter')).toBeInTheDocument();
    expect(await screen.findAllByText('Pricey')).toHaveLength(1);
  });
});
