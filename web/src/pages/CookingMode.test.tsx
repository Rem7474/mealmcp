import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { Ingredient, Recipe } from '../types';
import { CookingMode, matchStepIngredients } from './CookingMode';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

const ingredients: Ingredient[] = [
  { id: 1, productId: 10, name: 'Tomates cerises', quantity: 200, unit: 'g', note: 'halved', toTaste: false },
  { id: 2, productId: 11, name: "Huile d'olive", quantity: 15, unit: 'ml', note: null, toTaste: false },
  { id: 3, productId: 12, name: 'Basilic', quantity: 1, unit: 'piece', note: null, toTaste: true },
];

const recipe: Recipe = {
  id: 1,
  name: 'Roasted tomatoes',
  description: null,
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 15,
  rating: null,
  favorite: false,
  lastMadeOn: null,
  timesMade: 0,
  dietConflicts: [],
  equipment: [],
  tags: [],
  ingredients,
  steps: [
    {
      position: 1,
      text: "Faire chauffer l'huile dans un plat et ajouter la tomate.",
      durationMinutes: 15,
      temperatureC: 180,
      appliance: 'Four',
    },
    {
      position: 2,
      text: 'Servir chaud.',
      durationMinutes: null,
      temperatureC: null,
      appliance: null,
    },
  ],
};

describe('matchStepIngredients', () => {
  it('matches ingredients case-, accent-, and plural-insensitively', () => {
    const matched = matchStepIngredients("Ajouter la tomate et un filet d'huile.", ingredients);
    expect(matched.map((i) => i.name)).toEqual(['Tomates cerises', "Huile d'olive"]);
  });

  it('returns empty array when no ingredient is mentioned', () => {
    expect(matchStepIngredients('Préchauffer le four.', ingredients)).toEqual([]);
  });
});

describe('CookingMode', () => {
  it('displays contextual scaled ingredients, badges, timer and navigates steps', async () => {
    const onClose = vi.fn();
    renderApp(<CookingMode recipe={recipe} activeServings={4} onClose={onClose} />);

    expect(screen.getByText('Step 1 of 2 · 4 servings')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.getByText('180 °C')).toBeInTheDocument();
    expect(screen.getByText('Four')).toBeInTheDocument();

    // Scaled x2 (4 servings / 2 base servings): 400 g & 30 ml, Basilic excluded on step 1.
    expect(screen.getByText('Tomates cerises')).toBeInTheDocument();
    expect(screen.getByText('400 g')).toBeInTheDocument();
    expect(screen.getByText("Huile d'olive")).toBeInTheDocument();
    expect(screen.getByText('30 ml')).toBeInTheDocument();
    expect(screen.queryByText('Basilic')).not.toBeInTheDocument();

    // Toggle to view all ingredients.
    await userEvent.click(screen.getByRole('button', { name: 'All ingredients (3)' }));
    expect(screen.getByText('Basilic')).toBeInTheDocument();

    // Navigate to step 2 (no ingredients mentioned, no timer).
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Step 2 of 2 · 4 servings')).toBeInTheDocument();
    expect(screen.getByText('No specific ingredient mentioned in this step.')).toBeInTheDocument();

    // Finish closes cooking mode.
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts, pauses and resets the countdown timer', async () => {
    renderApp(<CookingMode recipe={recipe} activeServings={2} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('15:00')).toBeInTheDocument();
  });

  it('keeps a running timer visible across steps and lets the user jump back to it', async () => {
    renderApp(<CookingMode recipe={recipe} activeServings={2} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    const pill = screen.getByRole('button', { name: /Step 1: 15:00|Step 1: 14:59/ });
    expect(pill).toBeInTheDocument();
    await userEvent.click(pill);
    expect(screen.getByText('Step 1 of 2 · 2 servings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('marks the planned meal as cooked when mealId is provided', async () => {
    const { calls } = mockApi({ 'POST /plan/42/cook': { status: 200, body: { id: 42, cooked: true } } });
    const onClose = vi.fn();
    renderApp(<CookingMode recipe={recipe} activeServings={2} mealId={42} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finish & mark cooked' }));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/plan/42/cook')).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
