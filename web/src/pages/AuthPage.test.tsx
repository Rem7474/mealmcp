import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import { AuthPage, resetSession } from './AuthPage';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

describe('AuthPage', () => {
  it('signs in with email and password', async () => {
    const { calls } = mockApi({
      'POST /auth/login': { status: 200, body: { ok: true } },
      'GET /auth/me': { status: 401, body: { error: 'x' } },
    });
    renderApp(<AuthPage registrationOpen={false} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(calls[0]).toMatchObject({
        method: 'POST',
        path: '/auth/login',
        body: { email: 'a@example.com', password: 'a-long-password' },
      }),
    );
  });

  it('shows a readable message when the server refuses', async () => {
    mockApi({ 'POST /auth/login': { status: 400, body: { error: 'Invalid email or password' } } });
    renderApp(<AuthPage registrationOpen={false} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('Invalid email or password.x');
    expect(screen.getByRole('alert').textContent?.length).toBeGreaterThan(5);
  });

  it('requires an invite code to register while registration is closed', async () => {
    renderApp(<AuthPage registrationOpen={false} />);
    await userEvent.click(screen.getByRole('button', { name: /create|register|sign up/i }));
    expect(screen.getByLabelText(/invite/i)).toBeRequired();
  });

  it('makes the invite code optional when registration is open', async () => {
    renderApp(<AuthPage registrationOpen />);
    await userEvent.click(screen.getByRole('button', { name: /create|register|sign up/i }));
    expect(screen.getByLabelText(/invite/i)).not.toBeRequired();
  });
});

describe('resetSession', () => {
  it('tells the service worker to drop its caches and forgets household data', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage } } });
    const queryClient = { removeQueries: vi.fn(), invalidateQueries: vi.fn(async () => {}) };
    await resetSession(queryClient as never);
    expect(postMessage).toHaveBeenCalledWith('clear-caches');
    expect(queryClient.removeQueries).toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['me'] });
  });
});
