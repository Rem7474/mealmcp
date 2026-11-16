import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, today, weekStart } from '../format';
import { mockApi, renderApp } from '../test/utils';
import { WeekPlanner } from './WeekPlanner';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

const start = weekStart(today());
const slot = (i: number, status: string, name: string | null) => ({
  key: `${addDays(start, i)}|dinner`,
  date: addDays(start, i),
  mealType: 'dinner',
  servings: 2,
  status,
  recipe: name ? { id: i + 1, name, prepMinutes: 10, cookMinutes: 10, reasons: ['usesExpiring'], missing: ['Leeks'] } : null,
  alternatives: 1,
});
const plan = (slots: unknown[]) => ({ id: 7, status: 'pending', source: 'rules', expiresAt: Date.now() + 1000, alreadyPlanned: [], slots });

describe('WeekPlanner', () => {
  it('asks for the meals, reviews each proposal, then writes only what was kept', async () => {
    const { calls } = mockApi({
      'GET /plan/week': { status: 200, body: null },
      'GET /recipes?search=&tag=': { status: 200, body: [{ id: 9, name: 'Mine', tags: [] }] },
      'POST /plan/week': { status: 201, body: plan([slot(0, 'proposed', 'Soup'), slot(1, 'proposed', 'Stew')]) },
      [`POST /plan/week/7/slots/${encodeURIComponent(`${addDays(start, 0)}|dinner`)}/accept`]: {
        status: 200,
        body: plan([slot(0, 'accepted', 'Soup'), slot(1, 'proposed', 'Stew')]),
      },
      'POST /plan/week/7/apply': { status: 200, body: { planned: [{}], skipped: [], from: start, to: start } },
    });
    renderApp(<WeekPlanner start={start} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Propose a menu' }));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      meals: expect.arrayContaining([{ date: start, mealType: 'dinner' }]),
    });
    expect(await screen.findByText('Soup')).toBeInTheDocument();
    expect(screen.getAllByText(/uses what expires soon · to buy: Leeks/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Add 0 to my plan' })).toBeDisabled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Keep' })[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Add 1 to my plan' }));
    expect(await screen.findByText('1 meals added to your plan.')).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith('/apply'))).toBe(true);
  });

  it('resumes a plan left under review', async () => {
    mockApi({
      'GET /plan/week': { status: 200, body: plan([slot(0, 'proposed', 'Soup')]) },
      'GET /recipes?search=&tag=': { status: 200, body: [] },
    });
    renderApp(<WeekPlanner start={start} onClose={() => {}} />);
    expect(await screen.findByText('Soup')).toBeInTheDocument();
  });

  it('says so when no other recipe fits', async () => {
    mockApi({
      'GET /plan/week': { status: 200, body: plan([slot(0, 'refused', null)]) },
      'GET /recipes?search=&tag=': { status: 200, body: [] },
    });
    renderApp(<WeekPlanner start={start} onClose={() => {}} />);
    expect(await screen.findByText(/No other recipe fits/)).toBeInTheDocument();
  });
});
