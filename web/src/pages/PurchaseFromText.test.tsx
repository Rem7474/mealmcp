import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import { PurchaseFromText } from './PurchaseFromText';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

const parsed = {
  lines: [
    { text: '2 kg rice 3.1€', name: 'Rice', quantity: 2, unit: 'kg', price: 3.1, match: 'name', onList: true, include: true },
    { text: 'quinoa', name: 'Quinoa', quantity: 1, unit: 'piece', price: null, match: 'new', onList: false, include: true },
    { text: '9999999999999', name: '', quantity: 1, unit: 'piece', price: null, match: 'unknown', onList: false, include: false },
  ],
};

describe('PurchaseFromText', () => {
  it('reads the text, lets the lines be corrected, and sends only what is kept', async () => {
    const { calls } = mockApi({
      'POST /shopping/from-text': { status: 200, body: parsed },
      'POST /shopping/from-text/apply': { status: 200, body: { addedToStock: 2, removedFromList: 1, location: 'pantry', expenseId: 4 } },
    });
    renderApp(<PurchaseFromText onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('What you bought'), '2 kg rice 3.1€');
    await userEvent.click(screen.getByRole('button', { name: 'Check my list' }));

    expect(await screen.findByDisplayValue('Rice')).toBeInTheDocument();
    expect(screen.getByText('on your list')).toBeInTheDocument();
    expect(screen.getByText('new product')).toBeInTheDocument();
    expect(screen.getByText('unknown barcode: give it a name')).toBeInTheDocument();
    // The unnamed barcode line is off by default.
    expect(screen.getByRole('button', { name: 'Put 2 away' })).toBeEnabled();

    await userEvent.clear(screen.getByLabelText('Quantity of line 1'));
    await userEvent.type(screen.getByLabelText('Quantity of line 1'), '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Put 2 away' }));

    expect(await screen.findByText('2 items put away.')).toBeInTheDocument();
    const sent = calls.find((c) => c.path === '/shopping/from-text/apply')?.body as { lines: unknown[]; location: string };
    expect(sent.lines).toEqual([
      { name: 'Rice', quantity: 1.5, unit: 'kg', price: 3.1 },
      { name: 'Quinoa', quantity: 1 },
    ]);
    expect(sent.location).toBe('pantry');
  });

  it('says so when nothing could be read', async () => {
    mockApi({ 'POST /shopping/from-text': { status: 200, body: { lines: [] } } });
    renderApp(<PurchaseFromText onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('What you bought'), '???');
    await userEvent.click(screen.getByRole('button', { name: 'Check my list' }));
    expect(await screen.findByText('Nothing readable in that text.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Put 0 away' })).toBeDisabled();
  });
});

describe('PurchaseFromText with AI', () => {
  const status = (text: boolean) => ({
    status: 200,
    body: { enabled: text, reachable: text, text, textModel: text ? 'm' : null, visionModel: null, vision: 'unknown' },
  });

  it('offers the model only when it is usable, and fills the total it found', async () => {
    const { calls } = mockApi({
      'GET /ai/status': status(true),
      'POST /shopping/from-text/ai': {
        status: 200,
        body: {
          total: 12.3,
          lines: [{ text: 'milk', name: 'Milk', quantity: 2, unit: 'piece', price: null, match: 'new', onList: false, include: true }],
        },
      },
    });
    renderApp(<PurchaseFromText onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('What you bought'), 'I took two milks');
    await userEvent.click(await screen.findByRole('button', { name: 'Read it with AI' }));
    expect(calls.some((c) => c.path === '/shopping/from-text/ai')).toBe(true);
    expect(await screen.findByDisplayValue('Milk')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12.3')).toBeInTheDocument();
  });

  it('is absent without an AI server', async () => {
    mockApi({ 'GET /ai/status': status(false) });
    renderApp(<PurchaseFromText onClose={() => {}} />);
    await screen.findByRole('button', { name: 'Check my list' });
    expect(screen.queryByRole('button', { name: 'Read it with AI' })).toBeNull();
  });
});

describe('PurchaseFromText with a receipt', () => {
  const on = { status: 200, body: { enabled: true, reachable: true, text: true, textModel: 'm', visionModel: null, vision: 'unknown' } };

  it('sends the file as it is, fills the review and the shop, and never stores it', async () => {
    const { calls } = mockApi({
      'GET /ai/status': on,
      'POST /shopping/receipt': {
        status: 200,
        body: {
          total: 3.1,
          store: 'Shop',
          lines: [{ text: 'rice', name: 'Rice', quantity: 2, unit: 'kg', price: 3.1, match: 'new', onList: false, include: true }],
        },
      },
    });
    renderApp(<PurchaseFromText onClose={() => {}} />);
    const file = new File(['%PDF-1.4'], 'ticket.pdf', { type: 'application/pdf' });
    await userEvent.upload(await screen.findByLabelText(/Or a receipt/), file);
    expect(await screen.findByDisplayValue('Rice')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Shop')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/shopping/receipt')).toBeTruthy();
  });

  it('stays on the text step when the server refuses the file (a scanned PDF)', async () => {
    const { calls } = mockApi({
      'GET /ai/status': on,
      'POST /shopping/receipt': { status: 422, body: { error: 'This PDF has no text, it is a scan: send a photo of it instead' } },
    });
    renderApp(<PurchaseFromText onClose={() => {}} />);
    await userEvent.upload(await screen.findByLabelText(/Or a receipt/), new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === '/shopping/receipt')).toBe(true));
    expect(screen.getByRole('button', { name: 'Check my list' })).toBeInTheDocument();
  });
});

describe('PurchaseFromText decimal comma', () => {
  it('accepts a decimal comma in quantity, price and total', async () => {
    const { calls } = mockApi({
      'GET /ai/status': {
        status: 200,
        body: { enabled: false, reachable: false, text: false, textModel: null, visionModel: null, vision: 'no' },
      },
      'POST /shopping/from-text': {
        status: 200,
        body: {
          lines: [{ text: 'Flour', name: 'Flour', quantity: 1, unit: 'kg', price: null, match: 'new', onList: false, include: true }],
        },
      },
      'POST /shopping/from-text/apply': { status: 200, body: { addedToStock: 1, removedFromList: 0 } },
    });
    renderApp(<PurchaseFromText onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('What you bought'), 'Flour');
    await userEvent.click(screen.getByRole('button', { name: 'Check my list' }));

    const qty = await screen.findByLabelText('Quantity of line 1');
    await userEvent.clear(qty);
    await userEvent.type(qty, '1,5');
    await userEvent.type(screen.getByLabelText('Price of line 1'), '2,40');
    await userEvent.type(screen.getByLabelText('Total paid (optional)'), '10,50');
    await userEvent.click(screen.getByRole('button', { name: 'Put 1 away' }));

    const sent = calls.find((c) => c.path === '/shopping/from-text/apply')?.body as Record<string, unknown>;
    expect(sent).toMatchObject({ total: 10.5, lines: [{ name: 'Flour', quantity: 1.5, unit: 'kg', price: 2.4 }] });
  });
});
