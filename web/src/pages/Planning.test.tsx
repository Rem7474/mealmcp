import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, today, weekStart } from '../format';
import { mockApi, renderApp } from '../test/utils';
import { Accordion } from '../ui';
import { Planning } from './Planning';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

function scriptWeek(meals: unknown[]) {
  const from = weekStart(today());
  const to = addDays(from, 6);
  const range = `from=${from}&to=${to}`;
  return mockApi({
    [`GET /plan?${range}`]: { status: 200, body: meals },
    [`GET /plan/slots?${range}`]: { status: 200, body: [] },
    [`GET /budget/plan-cost?${range}`]: { status: 200, body: { totalCents: 0, incompleteMeals: 0, meals: [] } },
    'GET /settings': { status: 200, body: {} },
    'GET /recipes/suggest?withinDays=5&limit=3': { status: 200, body: { expiring: [], suggestions: [] } },
    'GET /budget/status': { status: 200, body: { budgetCents: null } },
    'GET /recipes?search=&tag=': { status: 200, body: [] },
  });
}

describe('Planning', () => {
  it('shows a free-text meal in full instead of truncating its title', async () => {
    scriptWeek([
      {
        id: 1,
        date: today(),
        mealType: 'lunch',
        recipeId: null,
        recipeName: null,
        title: 'Restaurant with friends',
        servings: 4,
        cooked: false,
      },
    ]);
    renderApp(<Planning />);
    const [title] = await screen.findAllByText('Restaurant with friends');
    expect(title.className).not.toContain('truncate');
  });

  it('offers a floating add button on phones that opens the meal form', async () => {
    scriptWeek([]);
    renderApp(<Planning />);
    const fab = (await screen.findAllByRole('button', { name: 'Plan a meal' })).find((b) => b.className.includes('fixed'));
    expect(fab).toBeDefined();
    expect(fab?.className).toContain('sm:hidden');
    await userEvent.click(fab as HTMLElement);
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });
});

describe('Accordion', () => {
  it('folds its body behind the summary', () => {
    renderApp(
      <Accordion summary="Options">
        <p>Body</p>
      </Accordion>,
    );
    const details = screen.getByText('Options').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Body')).toBeInTheDocument();
  });
});
