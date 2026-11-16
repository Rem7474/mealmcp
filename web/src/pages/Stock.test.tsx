import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { StockItem } from '../types';
import { EditStock, FreezePart, Stock } from './Stock';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

const opened: StockItem = {
  id: 7,
  productId: 3,
  name: 'Tomato sauce',
  category: null,
  quantity: 300,
  unit: 'g',
  location: 'fridge',
  expiresOn: '2026-01-13',
  addedOn: '2026-01-01',
  approximate: false,
  packSize: 400,
  packCount: null,
  opened: true,
  openedOn: '2026-01-10',
  printedExpiresOn: '2026-02-01',
  dateKind: null,
  expiryState: 'ok',
  frozen: false,
  thawed: false,
  frozenOn: null,
  thawedOn: null,
  note: null,
  brand: null,
  pricePer: null,
  paidPer: null,
};

function script() {
  return mockApi({
    'GET /products': { status: 200, body: [] },
    'GET /products/3/prices': {
      status: 200,
      body: { productId: 3, name: 'Tomato sauce', per: null, count: 0, byStore: [], observations: [] },
    },
    'PATCH /stock/7': { status: 200, body: opened },
  });
}

describe('EditStock', () => {
  it('sends only the opening date when it is corrected, so the expiry is recomputed by the server', async () => {
    const { calls } = script();
    renderApp(<EditStock item={opened} onClose={() => {}} />);
    expect(screen.getByText(/Printed date/)).toBeInTheDocument();
    const field = screen.getByLabelText('Opened on');
    await userEvent.clear(field);
    await userEvent.type(field, '2026-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ location: 'fridge', openedOn: '2026-01-05' });
  });

  it('offers no opening date on a sealed line', () => {
    script();
    renderApp(<EditStock item={{ ...opened, opened: false, openedOn: null, printedExpiresOn: null }} onClose={() => {}} />);
    expect(screen.queryByLabelText('Opened on')).not.toBeInTheDocument();
  });
});

describe('EditStock date kind', () => {
  it('lets the date be marked as use-by and sends it', async () => {
    const { calls } = script();
    renderApp(<EditStock item={opened} onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('The date is'), 'use_by');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ location: 'fridge', dateKind: 'use_by' });
  });
});

describe('EditStock freezer shelf life', () => {
  it('saves the product freezer and thawed shelf life', async () => {
    const product = {
      id: 3,
      name: 'Tomato sauce',
      openedShelfLifeDays: null,
      frozenShelfLifeDays: null,
      thawedShelfLifeDays: null,
      minStock: null,
    };
    const { calls } = mockApi({
      'GET /products': { status: 200, body: [product] },
      'GET /products/3/prices': {
        status: 200,
        body: { productId: 3, name: 'Tomato sauce', per: null, count: 0, byStore: [], observations: [] },
      },
      'PATCH /stock/7': { status: 200, body: opened },
      'PATCH /products/3': { status: 200, body: product },
    });
    renderApp(<EditStock item={opened} onClose={() => {}} />);
    await userEvent.type(await screen.findByLabelText('Days Tomato sauce keeps frozen'), '60');
    await userEvent.type(screen.getByLabelText('Days Tomato sauce keeps once thawed'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/products/3')?.body).toEqual({
      frozenShelfLifeDays: 60,
      thawedShelfLifeDays: 3,
    });
  });
});

describe('EditStock note, brand and barcode', () => {
  it('saves the line note and the product brand and barcode', async () => {
    const product = { id: 3, name: 'Tomato sauce', openedShelfLifeDays: null, brand: null, barcode: null, minStock: null };
    const { calls } = mockApi({
      'GET /products': { status: 200, body: [product] },
      'GET /products/3/prices': {
        status: 200,
        body: { productId: 3, name: 'Tomato sauce', per: null, count: 0, byStore: [], observations: [] },
      },
      'PATCH /stock/7': { status: 200, body: opened },
      'PATCH /products/3': { status: 200, body: product },
    });
    renderApp(<EditStock item={opened} onClose={() => {}} />);
    await userEvent.type(await screen.findByLabelText('Brand'), 'Panzani');
    await userEvent.type(screen.getByLabelText('Barcode'), '3038350000000');
    await userEvent.type(screen.getByLabelText('Note'), 'for Sunday');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/stock/7')?.body).toEqual({ location: 'fridge', note: 'for Sunday' });
    expect(calls.find((c) => c.method === 'PATCH' && c.path === '/products/3')?.body).toEqual({
      brand: 'Panzani',
      barcode: '3038350000000',
    });
  });
});

describe('EditStock price history', () => {
  it('shows the unit price history of the product', async () => {
    const product = { id: 3, name: 'Tomato sauce', openedShelfLifeDays: null, minStock: null };
    mockApi({
      'GET /products': { status: 200, body: [product] },
      'GET /products/3/prices': {
        status: 200,
        body: {
          productId: 3,
          name: 'Tomato sauce',
          per: 'kg',
          latestCents: 220,
          averageCents: 180,
          minCents: 120,
          maxCents: 220,
          trend: 'up',
          count: 3,
          alternative: null,
          byStore: [
            { store: 'Leclerc', latestCents: 120, averageCents: 120, count: 1 },
            { store: 'Market', latestCents: 220, averageCents: 210, count: 2 },
          ],
          observations: [{ id: 1, date: '2030-03-05', store: 'Market', source: 'receipt', cents: 220 }],
        },
      },
    });
    renderApp(<EditStock item={opened} onClose={() => {}} />);
    expect(await screen.findByText('Rising')).toBeInTheDocument();
    expect(screen.getByText('Price history')).toBeInTheDocument();
    expect(screen.getByText('Leclerc')).toBeInTheDocument();
    expect(screen.getAllByText(/2[.,]20.*\/ kg/).length).toBeGreaterThan(0);
  });

  it('says so when no price is known yet', async () => {
    mockApi({
      'GET /products': { status: 200, body: [{ id: 3, name: 'Tomato sauce', openedShelfLifeDays: null, minStock: null }] },
      'GET /products/3/prices': {
        status: 200,
        body: { productId: 3, name: 'Tomato sauce', per: null, count: 0, byStore: [], observations: [] },
      },
    });
    renderApp(<EditStock item={opened} onClose={() => {}} />);
    expect(await screen.findByText(/No price yet/)).toBeInTheDocument();
  });
});

describe('Stock page loading', () => {
  it('says nothing is here only once the stock has loaded', async () => {
    let release: (r: { status: number; body: unknown }) => void = () => {};
    const pending = new Promise<{ status: number; body: unknown }>((resolve) => {
      release = resolve;
    });
    mockApi({ 'GET /stock': () => pending });
    renderApp(<Stock />);
    expect(screen.queryByText('Nothing here.')).toBeNull();
    release({ status: 200, body: [] });
    expect(await screen.findAllByText('Nothing here.')).toHaveLength(3);
  });
});

describe('EditStock price follow-up', () => {
  const history = (extra: object) => ({
    status: 200,
    body: {
      productId: 3,
      name: 'Tomato sauce',
      per: 'kg',
      latestCents: 300,
      averageCents: 233,
      minCents: 200,
      maxCents: 300,
      trend: 'up',
      count: 3,
      alternative: null,
      byStore: [],
      observations: [],
      cheapestStore: null,
      high: false,
      freeform: null,
      ...extra,
    },
  });
  const open = () => renderApp(<EditStock item={opened} onClose={() => {}} />);
  const products = { status: 200, body: [{ id: 3, name: 'Tomato sauce', openedShelfLifeDays: null, minStock: null }] };

  it('names the cheapest shop and says when the latest price is high', async () => {
    mockApi({ 'GET /products': products, 'GET /products/3/prices': history({ high: true, cheapestStore: 'Leclerc' }) });
    open();
    expect(await screen.findByText('Cheapest at Leclerc')).toBeInTheDocument();
    expect(screen.getByText(/Well above its usual price/)).toBeInTheDocument();
  });

  it('says a free-form unit cannot be compared instead of showing nothing', async () => {
    mockApi({
      'GET /products': products,
      'GET /products/3/prices': history({ per: null, freeform: { unit: 'can', latestCents: 180, trend: 'up' } }),
    });
    open();
    expect(await screen.findByText(/Followed as typed.*per can/)).toBeInTheDocument();
    expect(screen.queryByText(/No price yet/)).toBeNull();
  });
});

describe('FreezePart', () => {
  it('sends the part to freeze, and only when it is a positive number', async () => {
    const { calls } = mockApi({ 'POST /stock/7/freeze': { status: 200, body: {} } });
    let closed = false;
    renderApp(<FreezePart item={{ ...opened, quantity: 1000, unit: 'g' }} onClose={() => (closed = true)} />);
    const freeze = screen.getByRole('button', { name: 'Freeze' });
    expect(freeze).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Quantity to freeze (g)'), '300');
    await userEvent.click(freeze);
    expect(calls).toEqual([{ method: 'POST', path: '/stock/7/freeze', body: { quantity: 300 } }]);
    await vi.waitFor(() => expect(closed).toBe(true));
  });
});

describe('Add to stock with a barcode', () => {
  const base = {
    'GET /stock': { status: 200, body: [] },
    'GET /stock/alerts': { status: 200, body: { lowStock: [], opened: [], expiring: [] } },
    'GET /products': { status: 200, body: [] },
  };
  const openSheet = async () => {
    renderApp(<Stock />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Add to stock' }))[0]);
  };

  it('fills name, size and unit from the catalogue, counts packs with + and sends the code', async () => {
    const { calls } = mockApi({
      ...base,
      'GET /catalog/products/3017620422003?lang=en': {
        status: 200,
        body: {
          code: '3017620422003',
          known: null,
          hit: {
            code: '3017620422003',
            name: 'Tomato sauce',
            genericName: 'Sauce',
            brand: 'Panzani',
            brands: 'Panzani',
            packSize: { size: 400, unit: 'g', count: 1 },
          },
          suggestions: [],
        },
      },
      'POST /stock': { status: 201, body: {} },
    });
    await openSheet();
    await userEvent.type(screen.getByLabelText('Barcode'), '3017620422003{Enter}');
    expect(await screen.findByText(/Found in the catalogue: Tomato sauce/)).toBeInTheDocument();
    expect(screen.getByText(/Brand: Panzani/)).toBeInTheDocument();
    expect(screen.getByLabelText('Product')).toHaveValue('Tomato sauce');
    expect(screen.getByLabelText('Pack size')).toHaveValue('400');
    await userEvent.click(screen.getByRole('button', { name: 'One pack more' }));
    await userEvent.click(screen.getByRole('button', { name: 'One pack more' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue('3');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const post = calls.find((c) => c.method === 'POST' && c.path === '/stock');
    expect(post?.body).toMatchObject({ name: 'Tomato sauce', barcode: '3017620422003', packSize: 400, packCount: 3, unit: 'g' });
  });

  it('offers the names the catalogue gives and the one of a product that already goes by it', async () => {
    mockApi({
      ...base,
      'GET /catalog/products/3017620422003?lang=en': {
        status: 200,
        body: {
          code: '3017620422003',
          known: null,
          hit: { code: '3017620422003', name: 'Napolitana', genericName: 'Tomato sauce', brand: null, brands: null, packSize: null },
          suggestions: [{ id: 3, name: 'Pasta sauce' }],
        },
      },
    });
    await openSheet();
    await userEvent.type(screen.getByLabelText('Barcode'), '3017620422003{Enter}');
    expect(await screen.findByRole('button', { name: 'Napolitana' })).toBeInTheDocument();
    expect(screen.getByLabelText('Product')).toHaveValue('Pasta sauce');
    await userEvent.click(screen.getByRole('button', { name: 'Napolitana' }));
    expect(screen.getByLabelText('Product')).toHaveValue('Napolitana');
  });

  it('leaves the fields to be typed when the catalogue cannot be reached, and keeps the code', async () => {
    const { calls } = mockApi({
      ...base,
      'GET /catalog/products/3017620422003?lang=en': { status: 400, body: { error: 'Open Food Facts cannot be reached right now.' } },
      'POST /stock': { status: 201, body: {} },
    });
    await openSheet();
    await userEvent.type(screen.getByLabelText('Barcode'), '3017620422003{Enter}');
    expect(await screen.findByText(/catalogue cannot be reached/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Product'), 'Flour');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/stock')?.body).toMatchObject({ name: 'Flour', barcode: '3017620422003' });
  });

  it('recognises a known code without a catalogue answer and offers the known sizes of a product', async () => {
    mockApi({
      ...base,
      'GET /products': {
        status: 200,
        body: [
          {
            id: 3,
            name: 'Tomato sauce',
            aliases: [],
            minStock: null,
            defaultUnit: 'g',
            barcodes: [
              { code: '3017620422003', brand: null, packSize: 200, unit: 'g', label: null },
              { code: '3017620422010', brand: null, packSize: 400, unit: 'g', label: null },
            ],
          },
        ],
      },
      'GET /catalog/products/3017620422010?lang=en': {
        status: 200,
        body: {
          code: '3017620422010',
          known: { productId: 3, productName: 'Tomato sauce', packSize: 400, unit: 'g' },
          hit: null,
          suggestions: [],
        },
      },
    });
    await openSheet();
    await userEvent.type(screen.getByLabelText('Barcode'), '3017620422010{Enter}');
    expect(await screen.findByText(/Already one of your products: Tomato sauce/)).toBeInTheDocument();
    expect(screen.getByLabelText('Pack size')).toHaveValue('400');
    await userEvent.click(screen.getByRole('button', { name: '200 g' }));
    expect(screen.getByLabelText('Pack size')).toHaveValue('200');
    expect(screen.getByLabelText('Barcode')).toHaveValue('3017620422003');
  });
});
