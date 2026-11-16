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
