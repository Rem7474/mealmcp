import { afterEach, describe, expect, it } from 'vitest';
import { ACCENTS, applyAccent, savedAccent } from './theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
});

describe('accent colour', () => {
  it('defaults to lavender and leaves the stylesheet values alone', () => {
    expect(savedAccent()).toBe('lavender');
    applyAccent('lavender');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });

  it('applies and remembers another accent', () => {
    applyAccent('tomato', true);
    const tomato = ACCENTS.find((a) => a.id === 'tomato');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(tomato?.color);
    expect(savedAccent()).toBe('tomato');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('mealmcp.accent', 'nope');
    expect(savedAccent()).toBe('lavender');
  });
});
