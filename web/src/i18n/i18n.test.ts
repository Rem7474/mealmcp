import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { localizeError } from './index';

const english = en as Record<string, string>;
const french = fr as Record<string, string>;

describe('translations', () => {
  it('French has every English message and nothing else', () => {
    const missing = Object.keys(english).filter((k) => !(k in french));
    const extra = Object.keys(french).filter((k) => !(k in english));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it('keeps the same {placeholders} in both languages', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const broken = Object.keys(english).filter((k) => JSON.stringify(names(english[k])) !== JSON.stringify(names(french[k] ?? '')));
    expect(broken).toEqual([]);
  });

  it('has no empty message', () => {
    expect(Object.entries(english).filter(([, v]) => !v.trim())).toEqual([]);
    expect(Object.entries(french).filter(([, v]) => !v.trim())).toEqual([]);
  });
});

describe('localizeError', () => {
  const t = ((key: string) => `[${key}]`) as never;

  it('translates the server messages people are shown', () => {
    expect(localizeError(t, 'Invalid email or password')).toBe('[err.invalidLogin]');
    expect(localizeError(t, 'This account could not be created. Check your details')).toBe('[err.cannotRegister]');
    expect(localizeError(t, 'Current password is incorrect')).toBe('[err.wrongPassword]');
    expect(localizeError(t, 'Too many attempts, try again later')).toBe('[err.tooMany]');
  });

  it('leaves unknown messages untouched', () => {
    expect(localizeError(t, 'Something else')).toBe('Something else');
  });
});
