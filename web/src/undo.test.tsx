import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './i18n';
import { confirmation, deferDelete, UndoHost } from './undo';

beforeEach(() => {
  localStorage.setItem('mealmcp.lang', 'en');
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  act(() => void vi.advanceTimersByTime(7000)); // settle anything a test left pending
  vi.useRealTimers();
});

const host = () =>
  render(
    <I18nProvider>
      <UndoHost />
    </I18nProvider>,
  );

describe('deferred deletion', () => {
  it('commits once the delay is over', () => {
    host();
    const commit = vi.fn();
    act(() => deferDelete({ commit, undo: vi.fn() }));
    expect(screen.getByRole('status')).toHaveTextContent('Removed');
    expect(commit).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(6100));
    expect(commit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not commit when undone', async () => {
    host();
    const commit = vi.fn();
    const undo = vi.fn();
    act(() => deferDelete({ commit, undo }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    act(() => void vi.advanceTimersByTime(7000));
    expect(undo).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits the previous deletion when a new one starts', () => {
    host();
    const first = vi.fn();
    act(() => deferDelete({ commit: first, undo: vi.fn() }));
    act(() => deferDelete({ commit: vi.fn(), undo: vi.fn() }));
    expect(first).toHaveBeenCalledOnce();
  });
});

describe('confirmation', () => {
  it('shows a short message that goes away by itself', () => {
    host();
    act(() => confirmation('Meal cooked'));
    expect(screen.getByRole('status')).toHaveTextContent('Meal cooked');
    act(() => void vi.advanceTimersByTime(4100));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
