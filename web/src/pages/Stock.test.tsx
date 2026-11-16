import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { StockItem } from '../types';
import { EditStock } from './Stock';

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
};

function script() {
  return mockApi({
    'GET /products': { status: 200, body: [] },
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
