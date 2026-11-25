import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../format';
import { mockApi, renderApp } from '../test/utils';
import type { Availability, Recipe, RecipeCost, RecipeStats, RecipeSummary } from '../types';
import { Recipes } from './Recipes';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  history.replaceState(null, '', '#recipes/12');
});

afterEach(() => history.replaceState(null, '', '#'));

const summary: RecipeSummary = {
  id: 12,
  name: 'Quiche',
  description: 'Leek and bacon',
  servings: 4,
  prepMinutes: 20,
  cookMinutes: 35,
  tags: ['oven'],
  ingredientCount: 3,
  rating: 4,
  favorite: false,
  lastMadeOn: '2026-11-20',
  timesMade: 3,
  dietConflicts: [],
};

const recipe: Recipe = {
  ...summary,
  equipment: [{ id: 1, name: 'Oven', kind: 'appliance', owned: true }],
  ingredients: [
    { id: 1, productId: 1, name: 'Leeks', quantity: 400, unit: 'g', note: 'sliced', toTaste: false },
    { id: 2, productId: 2, name: 'Eggs', quantity: 3, unit: 'piece', note: null, toTaste: false },
    { id: 3, productId: 3, name: 'Pepper', quantity: 0, unit: 'g', note: null, toTaste: true },
  ],
  steps: [],
};

const availability = (servings: number): Availability => ({
  canCook: false,
  missingEquipment: [],
  servings,
  ingredients: [
    { name: 'Leeks', unit: 'g', needed: 100 * servings, inStock: 200, missing: Math.max(0, 100 * servings - 200) },
    { name: 'Eggs', unit: 'piece', needed: servings, inStock: 12, missing: 0 },
    { name: 'Pepper', unit: 'g', needed: 0, inStock: 0, missing: 0, staple: true, toTaste: true },
  ],
});

const cost: RecipeCost = { servings: 4, totalCents: 640, perServingCents: 160, unpricedIngredients: ['Pepper'] };

const cooked: RecipeStats = {
  timesCooked: 3,
  lastCookedOn: '2026-11-20',
  firstCookedOn: '2026-09-02',
  daysSinceLast: 5,
  perMonth: 1.1,
  averageServings: 3.7,
  nextPlannedOn: '2026-12-01',
  recent: [
    { id: 31, date: '2026-11-20', mealType: 'dinner', servings: 4 },
    { id: 30, date: '2026-10-11', mealType: 'lunch', servings: 3 },
  ],
};

function recipeApi(stats: RecipeStats, routes: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /auth/me': { status: 200, body: { user: { id: 1, currency: 'EUR' } } },
    'GET /settings': { status: 200, body: {} },
    'GET /recipes?search=&tag=': { status: 200, body: [summary] },
    'GET /recipes/12': { status: 200, body: recipe },
    'GET /recipes/12/availability?servings=4': { status: 200, body: availability(4) },
    'GET /recipes/12/availability?servings=5': { status: 200, body: availability(5) },
    'GET /recipes/12/cost': { status: 200, body: cost },
    'GET /recipes/12/stats': { status: 200, body: stats },
    [`GET /seasons?month=${new Date().getMonth() + 1}`]: {
      status: 200,
      body: { country: 'FR', hemisphere: 'north', month: 11, inSeason: [], lastMonth: [], startingNextMonth: [] },
    },
    ...routes,
  });
}

/** The history card, once its numbers are in. */
async function historyCard() {
  const title = await screen.findByText('Cooking history');
  return within(title.closest('details') as HTMLElement);
}

describe('Recipe cooking history', () => {
  it('shows when the recipe was last cooked, how often, and the last meals', async () => {
    recipeApi(cooked);
    renderApp(<Recipes />);
    const card = await historyCard();
    // Something was cooked, so the card opens by itself.
    expect((await screen.findByText('Cooking history')).closest('details')).toHaveAttribute('open');

    const tile = (label: string) => card.getByText(label).nextElementSibling;
    expect(tile('Last cooked')).toHaveTextContent(`${formatDate('2026-11-20')} (5 days ago)`);
    expect(tile('Times cooked')).toHaveTextContent('3');
    expect(tile('Per month')).toHaveTextContent('1.1');
    expect(tile('Average servings')).toHaveTextContent('3.7');
    expect(tile('First time')).toHaveTextContent(formatDate('2026-09-02'));
    expect(tile('Next planned')).toHaveTextContent(formatDate('2026-12-01'));

    expect(card.getByText(`${formatDate('2026-11-20')} · Dinner · 4 servings`)).toBeInTheDocument();
    expect(card.getByText(`${formatDate('2026-10-11')} · Lunch · 3 servings`)).toBeInTheDocument();
  });

  it.each([
    [0, 'today'],
    [1, 'yesterday'],
  ])('says %i days ago in words', async (days, words) => {
    recipeApi({ ...cooked, daysSinceLast: days, nextPlannedOn: null });
    renderApp(<Recipes />);
    const card = await historyCard();
    expect(card.getByText('Last cooked').nextElementSibling).toHaveTextContent(`(${words})`);
    // Nothing planned: no tile for it.
    expect(card.queryByText('Next planned')).toBeNull();
  });

  it('explains how the history fills in for a recipe never cooked, and still shows the next planned meal', async () => {
    recipeApi({
      timesCooked: 0,
      lastCookedOn: null,
      firstCookedOn: null,
      daysSinceLast: null,
      perMonth: 0,
      averageServings: null,
      nextPlannedOn: '2026-12-01',
      recent: [],
    });
    renderApp(<Recipes />);
    const card = await historyCard();
    expect(card.getByText('Not cooked yet. It shows up here once a planned meal is marked as cooked.')).toBeInTheDocument();
    expect(card.getByText(`Next planned: ${formatDate('2026-12-01')}`)).toBeInTheDocument();
    expect(card.queryByText('Times cooked')).toBeNull();
    // Nothing to show yet: the card stays folded.
    expect((await screen.findByText('Cooking history')).closest('details')).not.toHaveAttribute('open');
  });
});

describe('Recipe page', () => {
  it('shows what the recipe costs, what is missing, and scales the ingredients', async () => {
    recipeApi(cooked);
    renderApp(<Recipes />);
    expect(await screen.findByText('Cost: about €1.60 per serving (€6.40 in total)')).toBeInTheDocument();
    expect(screen.getByText('No price yet for: Pepper. The cost is a minimum.')).toBeInTheDocument();
    expect(await screen.findByText('ingredients missing')).toBeInTheDocument();
    expect(screen.getByText('400 g')).toBeInTheDocument();
    expect(screen.getByText('to taste')).toBeInTheDocument();
    expect(screen.getByText('(sliced)')).toBeInTheDocument();
    expect(screen.getByText('· always at home')).toBeInTheDocument();
    expect(screen.getByText('missing 200 g')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'More servings' }));
    expect(await screen.findByText('500 g')).toBeInTheDocument();
    expect(await screen.findByText('missing 300 g')).toBeInTheDocument();
  });

  it('rates the recipe and marks it as a favorite', async () => {
    const { calls } = recipeApi(cooked, { 'PATCH /recipes/12': { status: 200, body: {} } });
    renderApp(<Recipes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Favorite' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ favorite: true }]));
    await userEvent.click(screen.getByRole('button', { name: 'Rate 5 out of 5' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ rating: 5 }));
  });

  it('goes back to the list, which shows when each recipe was last made', async () => {
    recipeApi(cooked);
    renderApp(<Recipes />);
    await userEvent.click(await screen.findByRole('button', { name: '← Recipes' }));
    expect(location.hash).toBe('#recipes');
    expect(await screen.findByText(`Made ${formatDate('2026-11-20')} · 3 times`)).toBeInTheDocument();
  });
});
