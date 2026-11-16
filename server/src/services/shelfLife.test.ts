import { describe, expect, it } from 'vitest';
import { effectiveExpiry, effectiveKind, expiryState, freezerDays, openedExpiry, printedDate } from './shelfLife.js';

describe('openedExpiry', () => {
  it('keeps the printed date when the product has no opened shelf life', () => {
    expect(openedExpiry(null, '2026-01-10', '2026-02-01')).toBe('2026-02-01');
    expect(openedExpiry(undefined, '2026-01-10', null)).toBeNull();
    expect(openedExpiry(0, '2026-01-10', '2026-02-01')).toBe('2026-02-01');
  });

  it('uses opening date plus shelf life when there is no printed date', () => {
    expect(openedExpiry(3, '2026-01-10', null)).toBe('2026-01-13');
  });

  it('never goes past the printed date', () => {
    expect(openedExpiry(30, '2026-01-10', '2026-01-15')).toBe('2026-01-15');
    expect(openedExpiry(3, '2026-01-10', '2026-02-01')).toBe('2026-01-13');
  });
});

describe('effectiveExpiry', () => {
  it('leaves a sealed line alone', () => {
    expect(effectiveExpiry({ expiresOn: '2026-03-01', openedOn: null }, { openedShelfLifeDays: 3 })).toBe('2026-03-01');
    expect(effectiveExpiry({ expiresOn: null, openedOn: null }, {})).toBeNull();
  });

  it('applies the opened shelf life to an opened line', () => {
    expect(effectiveExpiry({ expiresOn: '2026-03-01', openedOn: '2026-01-10' }, { openedShelfLifeDays: 3 })).toBe('2026-01-13');
    expect(effectiveExpiry({ expiresOn: null, openedOn: '2026-01-10' }, {})).toBeNull();
  });
});

describe('printedDate', () => {
  it('prefers the stored printed date', () => {
    expect(
      printedDate({ expiresOn: '2026-01-13', printedExpiresOn: '2026-02-01', openedOn: '2026-01-10' }, { openedShelfLifeDays: 3 }),
    ).toBe('2026-02-01');
  });

  it('reads a sealed legacy line as its own printed date', () => {
    expect(printedDate({ expiresOn: '2026-03-01', openedOn: null }, {})).toBe('2026-03-01');
  });

  it('treats an expiry that only came from the shelf life as an unknown printed date', () => {
    expect(printedDate({ expiresOn: '2026-01-13', openedOn: '2026-01-10' }, { openedShelfLifeDays: 3 })).toBeNull();
  });

  it('keeps a legacy opened expiry that differs from the shelf life: it was printed', () => {
    expect(printedDate({ expiresOn: '2026-01-11', openedOn: '2026-01-10' }, { openedShelfLifeDays: 3 })).toBe('2026-01-11');
  });

  it('recomputes an opened line from the printed date when the opening date moves', () => {
    const line = { expiresOn: '2026-01-13', printedExpiresOn: '2026-02-01', openedOn: '2026-01-20' };
    expect(effectiveExpiry(line, { openedShelfLifeDays: 3 })).toBe('2026-01-23');
  });
});

describe('expiryState', () => {
  const now = '2026-01-10';
  it('has no state without a date', () => {
    expect(expiryState({ expiresOn: null, dateKind: 'use_by' }, now)).toBe('none');
  });

  it('tells ok from soon', () => {
    expect(expiryState({ expiresOn: '2026-01-20' }, now)).toBe('ok');
    expect(expiryState({ expiresOn: '2026-01-13' }, now)).toBe('soon');
    expect(expiryState({ expiresOn: '2026-01-10', dateKind: 'use_by' }, now)).toBe('soon');
  });

  it('sends a line past its use-by date to the bin, and past a best-before or unspecified date to a check', () => {
    expect(expiryState({ expiresOn: '2026-01-09', dateKind: 'use_by' }, now)).toBe('discard');
    expect(expiryState({ expiresOn: '2026-01-09', dateKind: 'best_before' }, now)).toBe('check');
    expect(expiryState({ expiresOn: '2026-01-09', dateKind: null }, now)).toBe('check');
  });
});

describe('freezing', () => {
  const meat = { category: 'meat_fish' };

  it('reads the product figures first, then the category, then a general default', () => {
    expect(freezerDays({ frozenShelfLifeDays: 30, thawedShelfLifeDays: 1 })).toEqual({ frozenDays: 30, thawedDays: 1 });
    expect(freezerDays(meat)).toEqual({ frozenDays: 90, thawedDays: 2 });
    expect(freezerDays({ category: 'produce' }).frozenDays).toBe(240);
    expect(freezerDays({ category: 'unheard-of' })).toEqual({ frozenDays: 90, thawedDays: 2 });
  });

  it('replaces the printed date by the freezing date plus the frozen shelf life', () => {
    const line = { expiresOn: '2026-01-12', printedExpiresOn: '2026-01-12', openedOn: null, frozenOn: '2026-01-10' };
    expect(effectiveExpiry(line, meat)).toBe('2026-04-10');
    expect(effectiveExpiry(line, { ...meat, frozenShelfLifeDays: 30 })).toBe('2026-02-09');
  });

  it('starts the short thawed clock on thawing, and an opened thawed pack keeps the earlier date', () => {
    const line = { expiresOn: null, printedExpiresOn: '2026-01-12', openedOn: null, thawedOn: '2026-01-10' };
    expect(effectiveExpiry(line, meat)).toBe('2026-01-12');
    expect(effectiveExpiry({ ...line, openedOn: '2026-01-10' }, { ...meat, openedShelfLifeDays: 1 })).toBe('2026-01-11');
  });

  it('flags a thawed line as use-by and a frozen one as best-before', () => {
    expect(effectiveKind({ thawedOn: '2026-01-10', dateKind: 'best_before' })).toBe('use_by');
    expect(effectiveKind({ frozenOn: '2026-01-10', dateKind: 'use_by' })).toBe('best_before');
    expect(expiryState({ expiresOn: '2026-01-09', thawedOn: '2026-01-07' }, '2026-01-10')).toBe('discard');
    expect(expiryState({ expiresOn: '2026-01-09', frozenOn: '2026-01-07' }, '2026-01-10')).toBe('check');
  });

  it('does not take a freezing-derived expiry for a printed date', () => {
    expect(printedDate({ expiresOn: '2026-04-10', openedOn: null, frozenOn: '2026-01-10' }, {})).toBeNull();
  });
});
