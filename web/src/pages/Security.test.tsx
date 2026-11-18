import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../test/utils';
import type { SessionInfo, User } from '../types';
import { DeleteAccountCard, DevicesCard, deviceName, PasswordCard, ProfileCard } from './Security';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
});

describe('deviceName', () => {
  it('names browser and system', () => {
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe('Chrome · Windows');
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17 like Mac OS X) Safari/604')).toBe('Safari · iOS');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120')).toBe('Edge · Windows');
  });

  it('copes with a missing or odd user agent', () => {
    expect(deviceName(null)).toBeNull();
    expect(deviceName('curl/8')).toBe('curl/8');
  });
});

describe('ProfileCard', () => {
  const user = {
    id: 1,
    name: 'Alice',
    email: 'alice@example.com',
    role: 'owner',
    householdId: 1,
    householdName: 'Home',
    currency: 'EUR',
  } as User;

  it('updates the name without asking for a password', async () => {
    const { calls } = mockApi({ 'PATCH /auth/profile': { status: 200, body: { user: { ...user, name: 'Alice B' } } } });
    renderApp(<ProfileCard user={user} />);
    const nameInput = screen.getByLabelText('Name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Alice B');
    expect(screen.queryByLabelText(/Current password/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(calls[0].body).toEqual({ name: 'Alice B', email: 'alice@example.com' });
  });

  it('asks for the current password when the email changes', async () => {
    const { calls } = mockApi({ 'PATCH /auth/profile': { status: 200, body: { user: { ...user, email: 'bob@example.com' } } } });
    renderApp(<ProfileCard user={user} />);
    const emailInput = screen.getByLabelText('Email address');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'bob@example.com');
    await userEvent.type(screen.getByLabelText(/Current password/), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(calls[0].body).toEqual({ name: 'Alice', email: 'bob@example.com', currentPassword: 'secret-password' });
  });
});

describe('PasswordCard', () => {
  it('sends both passwords and confirms', async () => {
    const { calls } = mockApi({ 'POST /auth/password': { status: 200, body: { ok: true } } });
    renderApp(<PasswordCard />);
    await userEvent.type(screen.getByLabelText('Current password'), 'old-password-1');
    await userEvent.type(screen.getByLabelText(/^New password/), 'new-password-22');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(calls[0].body).toEqual({ currentPassword: 'old-password-1', newPassword: 'new-password-22' });
  });
});

describe('DevicesCard', () => {
  const sessions: SessionInfo[] = [
    { id: 'aaaaaaaaaaaaaaaa', current: true, userAgent: 'Chrome/1 Windows', createdAt: 1, lastSeenAt: 1 },
    { id: 'bbbbbbbbbbbbbbbb', current: false, userAgent: 'Firefox/1 Linux', createdAt: 1, lastSeenAt: null },
  ] as SessionInfo[];

  it('lists devices and signs another one out, never the current one', async () => {
    const { calls } = mockApi({
      'GET /auth/sessions': { status: 200, body: sessions },
      'DELETE /auth/sessions/bbbbbbbbbbbbbbbb': { status: 204 },
    });
    renderApp(<DevicesCard />);
    expect(await screen.findByText('Firefox · Linux')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /sign out|revoke/i }).length).toBeGreaterThan(0);
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});

describe('DeleteAccountCard', () => {
  const user = { role: 'owner' } as User;

  it('needs a confirmation before anything is sent', async () => {
    const { calls } = mockApi({});
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderApp(<DeleteAccountCard user={user} />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.type(screen.getByLabelText(/password/i), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: /confirm|delete/i }));
    expect(calls).toHaveLength(0);
  });
});
