import { describe, expect, it } from 'vitest';
import { shownPrice, summarize } from './unitPrice.js';

const none = { gramsPerPiece: null, gramsPerMl: null };

describe('shownPrice', () => {
  it('reads grams per kg, millilitres per litre and pieces per piece', () => {
    expect(shownPrice({ ...none, unitPrice: 0.2, priceUnit: 'g' })?.main).toEqual({ cents: 200, per: 'kg' });
    expect(shownPrice({ ...none, unitPrice: 0.12, priceUnit: 'ml' })?.main).toEqual({ cents: 120, per: 'l' });
    expect(shownPrice({ ...none, unitPrice: 40, priceUnit: 'piece' })?.main).toEqual({ cents: 40, per: 'piece' });
  });

  it('gives no alternative without a conversion, and one with it', () => {
    expect(shownPrice({ ...none, unitPrice: 40, priceUnit: 'piece' })?.alt).toBeNull();
    // An egg of 50 g at 40 cents: 8 EUR per kg.
    const eggs = shownPrice({ gramsPerPiece: 50, gramsPerMl: null, unitPrice: 40, priceUnit: 'piece' });
    expect(eggs?.alt?.per).toBe('kg');
    expect(eggs?.alt?.cents).toBeCloseTo(800);
    // Flour at 2 EUR/kg, a 100 g piece: 20 cents each.
    const flour = shownPrice({ gramsPerPiece: 100, gramsPerMl: null, unitPrice: 0.2, priceUnit: 'g' });
    expect(flour?.alt).toMatchObject({ per: 'piece' });
    expect(flour?.alt?.cents).toBeCloseTo(20);
    // Milk at 1.2 EUR/l, 1.03 g/ml: per kg too.
    const milk = shownPrice({ gramsPerPiece: null, gramsPerMl: 1.03, unitPrice: 0.12, priceUnit: 'ml' });
    expect(milk?.alt?.per).toBe('kg');
    expect(milk?.alt?.cents).toBeCloseTo(116.5, 0);
  });

  it('is null without a usable price or for a free-form unit', () => {
    expect(shownPrice({ ...none, unitPrice: null, priceUnit: null })).toBeNull();
    expect(shownPrice({ ...none, unitPrice: 0, priceUnit: 'g' })).toBeNull();
    expect(shownPrice({ ...none, unitPrice: 5, priceUnit: 'can' })).toBeNull();
  });
});

describe('summarize', () => {
  it('has nothing to say without prices, and no trend with one', () => {
    expect(summarize([])).toBeNull();
    expect(summarize([2])).toMatchObject({ latest: 2, average: 2, min: 2, max: 2, trend: null, count: 1 });
  });

  it('compares the latest price with the earlier ones', () => {
    expect(summarize([2, 2, 2.4])?.trend).toBe('up');
    expect(summarize([2, 2, 1.8])?.trend).toBe('down');
    expect(summarize([2, 2.02, 2.03])?.trend).toBe('stable');
    expect(summarize([3, 1, 2])).toMatchObject({ latest: 2, average: 2, min: 1, max: 3 });
  });
});
