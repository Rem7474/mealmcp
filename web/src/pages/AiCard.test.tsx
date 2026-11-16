import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { AiStatus, User } from '../types';
import { AiCard } from './AiCard';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

const owner: User = { id: 1, email: 'a@x.test', name: 'A', role: 'owner', householdId: 1, householdName: 'H', currency: 'EUR' };
const member: User = { ...owner, id: 2, role: 'member' };
const on: AiStatus = { enabled: true, reachable: true, textModel: 'llama3', visionModel: null, text: true, vision: 'no' };
const models = [
  { id: 'llama3', vision: 'no' },
  { id: 'llava', vision: 'yes' },
  { id: 'mystery', vision: 'unknown' },
];

describe('AiCard', () => {
  it('shows nothing when the server has no AI configured', async () => {
    const { calls } = mockApi({ 'GET /ai/status': { status: 200, body: { ...on, enabled: false, reachable: false, text: false } } });
    const { container } = renderApp(<AiCard user={owner} />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });

  it('lets the owner pick a model from the listed ones and sends it', async () => {
    const { calls } = mockApi({
      'GET /ai/status': { status: 200, body: on },
      'GET /ai/models': { status: 200, body: models },
      'PUT /ai/model': { status: 200, body: { ...on, textModel: 'llava' } },
    });
    renderApp(<AiCard user={owner} />);
    const select = await screen.findByLabelText('Model');
    await screen.findAllByRole('option', { name: 'llava · reads images' });
    await userEvent.selectOptions(select, 'llava');
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ model: 'llava' }));
  });

  it('offers only models that can read images for the image model', async () => {
    mockApi({ 'GET /ai/status': { status: 200, body: on }, 'GET /ai/models': { status: 200, body: models } });
    renderApp(<AiCard user={owner} />);
    const select = await screen.findByLabelText(/Model for images/);
    await screen.findAllByRole('option', { name: 'mystery' });
    const names = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(names).toContain('mystery');
    expect(names.some((n) => n?.startsWith('llama3'))).toBe(false);
  });

  it('is read-only for a member', async () => {
    mockApi({ 'GET /ai/status': { status: 200, body: on }, 'GET /ai/models': { status: 200, body: models } });
    renderApp(<AiCard user={member} />);
    expect(await screen.findByLabelText('Model')).toBeDisabled();
    expect(screen.getByText('Only the household owner can change the models.')).toBeInTheDocument();
  });

  it('runs the test and lists what passed and what failed', async () => {
    mockApi({
      'GET /ai/status': { status: 200, body: on },
      'GET /ai/models': { status: 200, body: models },
      'POST /ai/test': { status: 200, body: { reachable: true, model: true, json: false, vision: 'skipped' } },
    });
    renderApp(<AiCard user={owner} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Test the connection' }));
    const list = await screen.findByRole('list', { name: 'Test result' });
    expect(list).toHaveTextContent('✓ The server answers');
    expect(list).toHaveTextContent('✗ It returns valid JSON');
    expect(list).not.toHaveTextContent('image');
  });

  it('explains when the server cannot be reached', async () => {
    mockApi({
      'GET /ai/status': { status: 200, body: { ...on, reachable: false, text: false } },
      'GET /ai/models': { status: 200, body: [] },
    });
    renderApp(<AiCard user={owner} />);
    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
    expect(screen.getByText(/LLM_BASE_URL/)).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeDisabled();
  });
});
