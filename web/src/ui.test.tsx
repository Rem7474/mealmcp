import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './test/utils';
import { Sheet } from './ui';

beforeEach(() => {
  try {
    localStorage.setItem('mealmcp.lang', 'en');
  } catch {}
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const touch = (y: number) => ({ touches: [{ clientY: y }] });

function open() {
  const onClose = vi.fn();
  renderApp(
    <Sheet title="Edit" onClose={onClose}>
      <p>Content</p>
    </Sheet>,
  );
  return { onClose, dialog: screen.getByRole('dialog', { hidden: true }) };
}

describe('Sheet swipe to close', () => {
  it('closes when the title is dragged down far enough', () => {
    const { onClose, dialog } = open();
    const title = screen.getByText('Edit');
    fireEvent.touchStart(title, touch(100));
    fireEvent.touchMove(title, touch(160));
    expect(dialog.style.transform).toBe('translateY(60px)');
    fireEvent.touchMove(title, touch(260));
    fireEvent.touchEnd(title);
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('springs back when released early and slowly', () => {
    const { onClose, dialog } = open();
    const title = screen.getByText('Edit');
    fireEvent.touchStart(title, touch(100));
    fireEvent.touchMove(title, touch(140));
    vi.advanceTimersByTime(500);
    fireEvent.touchEnd(title);
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.style.transform).toBe('');
  });

  it('closes on a short fast flick', () => {
    const { onClose } = open();
    const title = screen.getByText('Edit');
    fireEvent.touchStart(title, touch(100));
    vi.advanceTimersByTime(50);
    fireEvent.touchMove(title, touch(160));
    fireEvent.touchEnd(title);
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drags from the content only when it is scrolled to the top', () => {
    const { onClose } = open();
    const content = screen.getByText('Content');
    const body = content.parentElement as HTMLElement;
    Object.defineProperty(body, 'scrollTop', { value: 40, configurable: true });
    fireEvent.touchStart(content, touch(100));
    fireEvent.touchMove(content, touch(300));
    fireEvent.touchEnd(content);
    vi.advanceTimersByTime(200);
    expect(onClose).not.toHaveBeenCalled();
    Object.defineProperty(body, 'scrollTop', { value: 0, configurable: true });
    fireEvent.touchStart(content, touch(100));
    fireEvent.touchMove(content, touch(300));
    fireEvent.touchEnd(content);
    vi.advanceTimersByTime(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores an upward drag', () => {
    const { onClose } = open();
    const title = screen.getByText('Edit');
    fireEvent.touchStart(title, touch(300));
    fireEvent.touchMove(title, touch(100));
    fireEvent.touchEnd(title);
    vi.advanceTimersByTime(200);
    expect(onClose).not.toHaveBeenCalled();
  });
});
