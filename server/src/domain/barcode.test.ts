import { describe, expect, it } from 'vitest';
import { normalizeGtin, numericPackSize, parsePackSize } from './barcode.js';

describe('normalizeGtin', () => {
  it('reads UPC-A and EAN-13 with a leading zero as the same code', () => {
    expect(normalizeGtin('012345678905')).toBe('0012345678905');
    expect(normalizeGtin('0012345678905')).toBe('0012345678905');
  });
  it('keeps EAN-8 and EAN-13 as they are', () => {
    expect(normalizeGtin('96385074')).toBe('96385074');
    expect(normalizeGtin('3017620422003')).toBe('3017620422003');
  });
  it('drops the zero of a GTIN-14 that is an EAN-13 and keeps a real indicator digit', () => {
    expect(normalizeGtin('03017620422003')).toBe('3017620422003');
    expect(normalizeGtin('13017620422003')).toBe('13017620422003');
  });
  it('refuses what is not a barcode', () => {
    expect(normalizeGtin('abc')).toBeNull();
    expect(normalizeGtin('12345')).toBeNull();
    expect(normalizeGtin('123456789012345')).toBeNull();
  });
});

describe('parsePackSize', () => {
  it.each([
    ['500 g', 500, 'g', 1],
    ['1,5 kg', 1500, 'g', 1],
    ['1.5 kg', 1500, 'g', 1],
    ['75 cl', 750, 'ml', 1],
    ['1 l', 1000, 'ml', 1],
    ['330 ml', 330, 'ml', 1],
    ['500 g ℮', 500, 'g', 1],
    ['6 x 125 g', 125, 'g', 6],
    ['6x125g', 125, 'g', 6],
    ['4 × 25 cl', 250, 'ml', 4],
  ])('%s', (text, size, unit, count) => {
    expect(parsePackSize(text)).toEqual({ size, unit, count });
  });
  it.each(['4 tranches', '1 box', '', 'about 500 g', '0 g'])('gives nothing for %j', (text) => {
    expect(parsePackSize(text)).toBeNull();
  });
  it('gives nothing without text', () => {
    expect(parsePackSize(null)).toBeNull();
    expect(parsePackSize(undefined)).toBeNull();
  });
});

describe('numericPackSize', () => {
  it('reads the numeric fields of the catalogue', () => {
    expect(numericPackSize('500', 'g')).toEqual({ size: 500, unit: 'g', count: 1 });
    expect(numericPackSize(1, 'l')).toEqual({ size: 1000, unit: 'ml', count: 1 });
  });
  it('refuses a missing or odd value', () => {
    expect(numericPackSize(undefined, 'g')).toBeNull();
    expect(numericPackSize(0, 'g')).toBeNull();
    expect(numericPackSize(5, 'slices')).toBeNull();
  });
});
