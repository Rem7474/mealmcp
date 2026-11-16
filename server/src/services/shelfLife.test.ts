import { describe, expect, it } from 'vitest';
import { effectiveExpiry, openedExpiry, printedDate } from './shelfLife.js';

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
