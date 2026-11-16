import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import { Assistant } from './Assistant';
import { Home } from './Home';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

const on = { status: 200, body: { enabled: true, reachable: true, text: true, textModel: 'm', visionModel: null, vision: 'unknown' } };
const off = { status: 200, body: { enabled: false, reachable: false, text: false, textModel: null, visionModel: null, vision: 'no' } };
const home = { status: 200, body: { today: '2030-01-07', cards: [], budget: null } };

describe('Assistant', () => {
  it('sends the whole conversation, shows the answer and offers the screens it points to', async () => {
    const { calls } = mockApi({
      'POST /ai/chat': { status: 200, body: { reply: 'Cook the soup.', suggest: ['recipes'] } },
    });
    renderApp(<Assistant onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Your question'), 'what now?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Cook the soup.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Recipes' })).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/ai/chat')?.body).toEqual({ messages: [{ role: 'user', content: 'what now?' }] });

    await userEvent.type(screen.getByLabelText('Your question'), 'and tomorrow?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findAllByText('The assistant is thinking…').catch(() => []);
    const second = calls.filter((c) => c.path === '/ai/chat')[1]?.body as { messages: { role: string }[] };
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('says when the assistant could not answer, and keeps the question', async () => {
    mockApi({ 'POST /ai/chat': { status: 400, body: { error: 'The AI server is not available for this household' } } });
    renderApp(<Assistant onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText('Your question'), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not available');
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});

describe('Home and the assistant', () => {
  it('offers the conversation only when the AI server is usable', async () => {
    mockApi({ 'GET /next-actions': home, 'GET /ai/status': on });
    const { unmount } = renderApp(<Home />);
    expect(await screen.findByRole('button', { name: 'Ask the assistant' })).toBeInTheDocument();
    unmount();
    mockApi({ 'GET /next-actions': home, 'GET /ai/status': off });
    renderApp(<Home />);
    await screen.findByText('Nothing needs your attention right now.');
    expect(screen.queryByRole('button', { name: 'Ask the assistant' })).toBeNull();
  });
});
