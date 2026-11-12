import { describe, expect, it } from 'vitest';
import { addDays, daysUntil, formatMoney, formatQty, isoMonth, monthStart, today, toIso, weekStart } from './format';

describe('formatQty', () => {
  it('shows base units in a readable scale', () => {
    expect(formatQty(1500, 'g')).toMatch(/1[.,]5 kg/);
    expect(formatQty(2000, 'ml')).toMatch(/2 l/);
    expect(formatQty(250, 'g')).toMatch(/250 g/);
  });

  it('shows nothing for an unknown quantity', () => {
    expect(formatQty(null, 'g')).toBe('');
  });
});

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
    expect(addDays('2030-03-01', -1)).toBe('2030-02-28');
  });

  it('starts weeks on Monday', () => {
    expect(weekStart('2030-01-06')).toBe('2029-12-31'); // a Sunday belongs to the week that began on Monday
    expect(weekStart('2030-01-02')).toBe('2029-12-31');
  });

  it('formats ISO dates without a time-zone shift', () => {
    expect(toIso(new Date(2030, 5, 9))).toBe('2030-06-09');
    expect(isoMonth('2030-06-09')).toBe('2030-06');
    expect(monthStart('2030-06-09')).toBe('2030-06-01');
  });

  it('counts the days until a date', () => {
    expect(daysUntil(today())).toBe(0);
    expect(daysUntil(addDays(today(), 3))).toBe(3);
    expect(daysUntil(addDays(today(), -2))).toBe(-2);
  });
});

describe('formatMoney', () => {
  it('turns cents into a currency amount', () => {
    expect(formatMoney(249, 'EUR')).toMatch(/2[.,]49/);
    expect(formatMoney(249, 'EUR')).toContain('€');
  });

  it('survives an unknown currency code', () => {
    expect(formatMoney(100, 'not-a-currency')).toContain('1.00');
  });
});
