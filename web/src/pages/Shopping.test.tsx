import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDay } from '../format';
import { mockApi, renderApp } from '../test/utils';
import type { ShoppingItem, WasteRisk } from '../types';
import { Shopping } from './Shopping';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
  // jsdom has no matchMedia, which the folding cards read.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

const item = (id: number, name: string, extra: Partial<ShoppingItem> = {}): ShoppingItem => ({
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
  ...extra,
});

/** Every query the page makes, answered; `routes` adds or overrides some. */
const shoppingApi = (items: ShoppingItem[], routes: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({
    'GET /shopping': { status: 200, body: items },
    'GET /prices': { status: 200, body: [] },
    'GET /budget/status': { status: 200, body: { currency: 'EUR', month: '2026-11', budgetCents: null, spentCents: 0 } },
    'GET /shopping/waste-risks': { status: 200, body: [] },
    'GET /settings': { status: 200, body: { shoppingGroupBy: 'none' } },
    ...routes,
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

describe('Shopping buying formats', () => {
  it('says how many packs a line rounds up to and what is left over', async () => {
    shoppingApi([
      item(1, 'Eggs', { quantity: 12, unit: 'piece', needed: 8, packSize: 6, packs: 2, surplus: 4, source: 'plan' }),
      item(2, 'Skyr', { quantity: 900, unit: 'g', needed: 600, packSize: 450, packs: 2, surplus: 300, source: 'plan' }),
      item(3, 'Salt', { quantity: null as unknown as number }),
    ]);
    renderApp(<Shopping />);
    expect(await screen.findByText('need 8 · 2 pack(s) · 4 left over')).toBeInTheDocument();
    const skyr = screen.getByText('need 600 g · 2 pack(s) · 300 g left over');
    expect(skyr).toHaveAttribute('title', 'Bought by whole packs: the surplus counts towards the next meals.');
    // A line not bought by packs says nothing about them.
    expect(screen.getAllByText(/pack\(s\)/)).toHaveLength(2);
  });

  it('lets each checked line say where it goes, and only checked lines', async () => {
    const { calls } = shoppingApi([item(1, 'Milk', { checked: true, storeIn: 'fridge' }), item(2, 'Rice')], {
      'PATCH /shopping/1': { status: 200, body: {} },
    });
    renderApp(<Shopping />);
    const where = await screen.findByRole('combobox', { name: 'Where to put Milk' });
    expect(where).toHaveValue('fridge');
    expect(screen.queryByRole('combobox', { name: 'Where to put Rice' })).toBeNull();

    await userEvent.selectOptions(where, 'freezer');
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ location: 'freezer' }));
    expect(calls.find((c) => c.method === 'PATCH')?.path).toBe('/shopping/1');
  });

  it('puts the basket away in each usual place unless one place is chosen', async () => {
    const { calls } = shoppingApi([item(1, 'Milk', { checked: true, priceCents: 120 })], {
      'POST /shopping/complete': { status: 200, body: {} },
    });
    renderApp(<Shopping />);
    const place = await screen.findByRole('combobox', { name: 'Location' });
    expect(place).toHaveValue('');
    expect(within(place).getByRole('option', { name: 'each in its usual place' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add to stock' }));
    await waitFor(() => expect(calls.filter((c) => c.path === '/shopping/complete')).toHaveLength(1));
    // No place sent: the server uses each product's usual one.
    expect(calls.find((c) => c.path === '/shopping/complete')?.body).toEqual({});

    await userEvent.selectOptions(place, 'pantry');
    await userEvent.type(screen.getByRole('textbox', { name: 'Shop (optional)' }), ' Lidl ');
    await userEvent.type(screen.getByRole('textbox', { name: 'Total paid (optional)' }), '12,40');
    await userEvent.click(screen.getByRole('button', { name: 'Add to stock' }));
    await waitFor(() => expect(calls.filter((c) => c.path === '/shopping/complete')).toHaveLength(2));
    expect(calls.filter((c) => c.path === '/shopping/complete')[1]?.body).toEqual({ location: 'pantry', store: 'Lidl', total: 12.4 });
    // The shop and total are cleared for the next trip; the place is kept.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Shop (optional)' })).toHaveValue(''));
    expect(screen.getByRole('textbox', { name: 'Total paid (optional)' })).toHaveValue('');
    expect(place).toHaveValue('pantry');
  });

  it('warns about food that goes off before the meal that needs it', async () => {
    const risk: WasteRisk = {
      stockId: 7,
      productId: 3,
      name: 'Spinach',
      quantity: 200,
      unit: 'g',
      expiresOn: '2026-11-26',
      nextUseOn: '2026-11-29',
      nextUseMeal: 'Quiche',
    };
    shoppingApi([], { 'GET /shopping/waste-risks': { status: 200, body: [risk] } });
    renderApp(<Shopping />);
    expect(await screen.findByText('Will go off first')).toBeInTheDocument();
    expect(
      screen.getByText(`Spinach (200 g) expires ${formatDay('2026-11-26')}, but Quiche only uses it on ${formatDay('2026-11-29')}.`),
    ).toBeInTheDocument();
  });
});

describe('Shopping list', () => {
  it('adds an item with its quantity and unit, then clears the form', async () => {
    const { calls } = shoppingApi([], { 'POST /shopping': { status: 200, body: {} } });
    renderApp(<Shopping />);
    expect(await screen.findByText('The list is empty.')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('combobox', { name: 'Item' }), 'Flour');
    await userEvent.type(screen.getByRole('textbox', { name: 'Quantity' }), '1,5');
    await userEvent.type(screen.getByRole('combobox', { name: 'Unit' }), 'kg');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Flour', quantity: 1.5, unit: 'kg' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Item' })).toHaveValue(''));
  });

  it('ticks a line, corrects its quantity and its price', async () => {
    const { calls } = shoppingApi([item(1, 'Butter', { quantity: 250, unit: 'g', estimatedCents: 300 })], {
      'PATCH /shopping/1': { status: 200, body: {} },
    });
    renderApp(<Shopping />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Butter' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ checked: true }));

    await userEvent.click(screen.getByRole('button', { name: '250 g' }));
    const qty = screen.getByRole('textbox', { name: 'Edit quantity for Butter' });
    await userEvent.clear(qty);
    await userEvent.type(qty, '500{Enter}');
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ quantity: 500 }));

    const price = screen.getByRole('textbox', { name: 'Price of Butter' });
    expect(price).toHaveAttribute('placeholder', expect.stringContaining('3.00'));
    await userEvent.type(price, '2,95{Enter}');
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ price: 2.95 }));
    const patches = calls.filter((c) => c.method === 'PATCH').length;
    // Typing something that is not a price sends nothing.
    await userEvent.clear(price);
    await userEvent.type(price, 'abc{Enter}');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(patches);
  });

  it('groups the list by aisle and by meal', async () => {
    const meal = { id: 5, date: '2026-11-27', mealType: 'dinner' as const, title: 'Quiche', recipeId: 2 };
    const items = [
      item(1, 'Milk', { category: 'dairy', source: 'plan', meals: [meal, { ...meal, id: 6, title: 'Crêpes' }] }),
      item(2, 'Sponges', { category: 'Garage' }),
      item(3, 'Bread'),
    ];
    let groupBy = 'aisle';
    const { calls } = shoppingApi(items, {
      'GET /settings': () => ({ status: 200, body: { shoppingGroupBy: groupBy } }),
      'PATCH /products/3': { status: 200, body: {} },
      'PUT /settings': ({ body }) => {
        groupBy = (body as { shoppingGroupBy: string }).shoppingGroupBy;
        return { status: 200, body: {} };
      },
    });
    renderApp(<Shopping />);
    expect(await screen.findByRole('heading', { name: /Dairy & eggs/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Garage/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Unsorted/ })).toBeInTheDocument();
    const aisles = screen.getAllByRole('combobox', { name: 'Aisle' });
    expect(aisles).toHaveLength(3);
    // A shop's own aisle name stays selectable.
    expect(within(aisles[1] as HTMLElement).getByRole('option', { name: 'Garage' })).toBeInTheDocument();

    // The chosen aisle is what is sent, not the one the select still shows while the request is built.
    await userEvent.selectOptions(aisles[2] as HTMLElement, 'dairy');
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ category: 'dairy' }));

    await userEvent.click(screen.getByRole('button', { name: 'Meal' }));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ shoppingGroupBy: 'meal' });
    expect(await screen.findByRole('heading', { name: new RegExp(`${formatDay('2026-11-27')} · Dinner · Quiche`) })).toBeInTheDocument();
    expect(screen.getByText('also for Crêpes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Other items/ })).toBeInTheDocument();
  });

  it('removes a line at once and sends the deletion once it can no longer be undone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { calls } = shoppingApi([item(1, 'Butter'), item(2, 'Flour')], { 'DELETE /shopping/1': { status: 204 } });
      renderApp(<Shopping />);
      await userEvent.click(await screen.findByRole('button', { name: 'Remove Butter' }));
      expect(screen.queryByText('Butter')).toBeNull();
      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
      await vi.advanceTimersByTimeAsync(6000);
      await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/shopping/1')).toBe(true));
    } finally {
      vi.useRealTimers();
    }
  });

  it('generates the list for the chosen days', async () => {
    const { calls } = shoppingApi([], { 'POST /shopping/generate': { status: 200, body: {} } });
    renderApp(<Shopping />);
    await screen.findByText('The list is empty.');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include low-stock products' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/shopping/generate')?.body).toMatchObject({ includeLowStock: false }));
  });

  it('shows the budget left once the list is bought', async () => {
    shoppingApi([item(1, 'Butter', { estimatedCents: 500 }), item(2, 'Flour')], {
      'GET /budget/status': { status: 200, body: { currency: 'EUR', month: '2026-11', budgetCents: 10000, spentCents: 2000 } },
    });
    renderApp(<Shopping />);
    expect(await screen.findByText('Budget left after')).toBeInTheDocument();
    expect(screen.getAllByText(/75\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText('(1 item without a price)')).toBeInTheDocument();
  });
});
