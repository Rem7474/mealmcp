import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { ActionCard, NextActions } from '../types';
import { Home } from './Home';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
    localStorage.removeItem('mealmcp.home.hidden');
  } catch {}
  location.hash = '';
});

const answer = (cards: ActionCard[], budget: NextActions['budget'] = null): NextActions => ({ today: '2030-01-07', cards, budget });
const serve = (body: NextActions) => mockApi({ 'GET /next-actions': { status: 200, body } });

const expiring: ActionCard = {
  id: 'expiring',
  target: 'recipes/12',
  items: [
    { name: 'Spinach', expiresOn: '2030-01-08', expiryState: 'soon' },
    { name: 'Yoghurt', expiresOn: '2030-01-09', expiryState: 'soon' },
  ],
  total: 2,
  recipe: { id: 12, name: 'Spinach gratin', canCook: true },
};
const slots: ActionCard = { id: 'open-slots', target: 'planning', count: 1, first: { date: '2030-01-08', mealType: 'dinner' } };

describe('Home', () => {
  it('words each card from its facts, with the right plural, and opens the right screen', async () => {
    serve(answer([expiring, slots]));
    renderApp(<Home />);

    expect(await screen.findByText('2 items to use up')).toBeTruthy();
    expect(screen.getByText('Spinach, Yoghurt')).toBeTruthy();
    expect(screen.getByText('Try Spinach gratin')).toBeTruthy();
    // One meal: the singular form.
    expect(screen.getByText('1 meal still to plan in the next 7 days')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'See the recipe' }));
    expect(location.hash).toBe('#recipes/12');
    fireEvent.click(screen.getByRole('button', { name: 'Open planning' }));
    expect(location.hash).toBe('#planning');
  });

  it('falls back to the stock when no recipe uses what expires', async () => {
    serve(answer([{ ...expiring, target: 'stock', recipe: null }]));
    renderApp(<Home />);
    expect(await screen.findByRole('button', { name: 'Open stock' })).toBeTruthy();
    expect(screen.queryByText(/Try /)).toBeNull();
  });

  it('shows the getting-started checklist, with the finished steps struck out and not clickable', async () => {
    serve(
      answer([
        {
          id: 'getting-started',
          target: 'recipes',
          steps: [
            { id: 'stock', done: true },
            { id: 'recipes', done: false },
            { id: 'plan', done: false },
          ],
        },
      ]),
    );
    renderApp(<Home />);
    expect(await screen.findByText('Getting started')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Add what you have at home/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Plan your next meals' }));
    expect(location.hash).toBe('#planning');
  });

  it('flags a meal that cannot be cooked with what is in stock', async () => {
    serve(
      answer([
        {
          id: 'cook-today',
          target: 'planning',
          meals: [
            { id: 1, name: 'Rice bowl', mealType: 'lunch', recipeId: 3, canCook: true },
            { id: 2, name: 'Steak', mealType: 'dinner', recipeId: 4, canCook: false },
          ],
        },
      ]),
    );
    renderApp(<Home />);
    expect(await screen.findByText('Steak')).toBeTruthy();
    expect(screen.getAllByText('Something is missing')).toHaveLength(1);
  });

  it('hides a card for the day, remembers it, and brings it back on request', async () => {
    serve(answer([expiring, slots]));
    const first = renderApp(<Home />);
    expect(await screen.findByText('2 items to use up')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Hide this card until tomorrow' })[0]);
    expect(screen.queryByText('2 items to use up')).toBeNull();
    expect(screen.getByText('1 meal still to plan in the next 7 days')).toBeTruthy();

    // Visiting again the same day: still hidden.
    first.unmount();
    renderApp(<Home />);
    expect(await screen.findByText('1 meal still to plan in the next 7 days')).toBeTruthy();
    expect(screen.queryByText('2 items to use up')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show hidden cards' }));
    expect(screen.getByText('2 items to use up')).toBeTruthy();
  });

  it('says so when nothing needs attention', async () => {
    serve(answer([]));
    renderApp(<Home />);
    expect(await screen.findByText('Nothing needs your attention right now.')).toBeTruthy();
  });

  it('shows the month against the budget and opens the budget page', async () => {
    serve(
      answer([], {
        currency: 'EUR',
        month: '2030-01',
        budgetCents: 10000,
        spentCents: 8500,
        remainingCents: 1500,
        projectedCents: 9000,
        daysInMonth: 31,
        day: 7,
        state: 'close',
      }),
    );
    renderApp(<Home />);
    expect(await screen.findByText('Close to the limit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /This month/ }));
    expect(location.hash).toBe('#budget');
  });

  it('shows spending when no budget is set, and no tile without either', async () => {
    serve(
      answer([], {
        currency: 'EUR',
        month: '2030-01',
        budgetCents: null,
        spentCents: 1200,
        remainingCents: null,
        projectedCents: 1200,
        daysInMonth: 31,
        day: 7,
        state: 'none',
      }),
    );
    const first = renderApp(<Home />);
    expect(await screen.findByText(/spent, no budget set/)).toBeTruthy();
    first.unmount();

    serve(answer([]));
    renderApp(<Home />);
    await screen.findByText('Nothing needs your attention right now.');
    expect(screen.queryByText('This month')).toBeNull();
  });
});
