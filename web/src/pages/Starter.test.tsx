import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { StarterOverview } from '../types';
import { StarterRecipes, StarterRecipesCard, StarterStock, StarterStockCard } from './Starter';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

const overview: StarterOverview = {
  aisles: [
    {
      aisle: 'dairy',
      products: [
        { key: 'milk', name: 'Milk', staple: false, added: false },
        { key: 'egg', name: 'Egg', staple: false, added: true },
      ],
    },
    { aisle: 'pantry', products: [{ key: 'oil', name: 'Olive oil', staple: true, added: false }] },
  ],
  recipes: [
    {
      key: 'pancakes',
      name: 'Pancakes',
      servings: 4,
      minutes: 30,
      tags: ['dessert'],
      ingredients: ['Flour', 'Egg', 'Milk'],
      imported: false,
    },
    { key: 'omelette', name: 'Cheese omelette', servings: 2, minutes: 10, tags: [], ingredients: ['Egg'], imported: false },
    { key: 'soup', name: 'Lentil soup', servings: 4, minutes: 40, tags: [], ingredients: ['Lentils'], imported: true },
  ],
};

describe('StarterStock', () => {
  it('asks the server in the screen language and shows products by aisle', async () => {
    const { calls } = mockApi({ 'GET /starter?lang=en': { status: 200, body: overview } });
    renderApp(<StarterStock onClose={() => {}} />);
    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Dairy & eggs' })).toBeInTheDocument();
    expect(calls[0]?.path).toBe('/starter?lang=en');
  });

  it('shows what is already at home as ticked and locked, and a staple with its meaning', async () => {
    mockApi({ 'GET /starter?lang=en': { status: 200, body: overview } });
    renderApp(<StarterStock onClose={() => {}} />);
    const egg = await screen.findByRole('checkbox', { name: /Egg/ });
    expect(egg).toBeChecked();
    expect(egg).toBeDisabled();
    expect(screen.getByText(/Always at home/)).toBeInTheDocument();
  });

  it('sends only what was ticked, then closes', async () => {
    let closed = false;
    const { calls } = mockApi({
      'GET /starter?lang=en': { status: 200, body: overview },
      'POST /starter/stock': { status: 201, body: { added: 2, skipped: 0 } },
    });
    renderApp(<StarterStock onClose={() => (closed = true)} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Milk' }));
    expect(screen.getByRole('button', { name: 'Add 1 product' })).toBeEnabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /Olive oil/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 products' }));
    await waitFor(() => expect(closed).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ lang: 'en', products: ['milk', 'oil'] });
  });
});

describe('StarterRecipes', () => {
  it('lists the recipes, locks the ones already imported and selects all the others at once', async () => {
    const { calls } = mockApi({
      'GET /starter?lang=en': { status: 200, body: overview },
      'POST /starter/recipes': { status: 201, body: { created: 2, skipped: 0, recipes: [] } },
    });
    renderApp(<StarterRecipes onClose={() => {}} />);
    expect(await screen.findByRole('checkbox', { name: /Lentil soup/ })).toBeDisabled();
    expect(screen.getByText(/already in your recipes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 recipes' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ lang: 'en', recipes: ['pancakes', 'omelette'] });
  });

  it('can be unselected again', async () => {
    mockApi({ 'GET /starter?lang=en': { status: 200, body: overview } });
    renderApp(<StarterRecipes onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Select all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.getByRole('button', { name: 'Add 0 recipes' })).toBeDisabled();
  });
});

describe('empty-state cards', () => {
  it('invite to tick the stock and open the picker', async () => {
    mockApi({ 'GET /starter?lang=en': { status: 200, body: overview } });
    renderApp(<StarterStockCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Tick what is at home' }));
    expect(await screen.findByRole('checkbox', { name: 'Milk' })).toBeInTheDocument();
  });

  it('invite to pick starter recipes and open the picker', async () => {
    mockApi({ 'GET /starter?lang=en': { status: 200, body: overview } });
    renderApp(<StarterRecipesCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Choose starter recipes' }));
    expect(await screen.findByRole('checkbox', { name: /Pancakes/ })).toBeInTheDocument();
  });
});
