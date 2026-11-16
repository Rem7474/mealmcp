import { describe, expect, it } from 'vitest';
import { fold, parseLine, splitLines } from './purchaseText.js';

describe('parseLine', () => {
  it.each([
    ['2 kg tomatoes', { name: 'tomatoes', quantity: 2, unit: 'kg', price: null }],
    ['2 kg de tomates', { name: 'tomates', quantity: 2, unit: 'kg', price: null }],
    ['6 eggs 2.40€', { name: 'eggs', quantity: 6, unit: null, price: 2.4 }],
    ['lait 1,15 €', { name: 'lait', quantity: null, unit: null, price: 1.15 }],
    ['pâtes 500g 0,89 eur', { name: 'pâtes', quantity: 500, unit: 'g', price: 0.89 }],
    ['3x yaourts', { name: 'yaourts', quantity: 3, unit: null, price: null }],
    ['1,5 litres de lait', { name: 'lait', quantity: 1.5, unit: 'l', price: null }],
    ['€3.20 butter', { name: 'butter', quantity: null, unit: null, price: 3.2 }],
    ['Coca 33cl', { name: 'Coca', quantity: 33, unit: 'cl', price: null }],
  ])('reads %s', (text, expected) => {
    expect(parseLine(text)).toMatchObject(expected);
  });

  it('finds a barcode and keeps it apart from the quantity', () => {
    expect(parseLine('3017620422003 2 1.99€')).toMatchObject({ barcode: '3017620422003', quantity: 2, price: 1.99, name: '' });
  });

  it('skips empty lines and lines with nothing to name', () => {
    expect(parseLine('   ')).toBeNull();
    expect(parseLine('2.50€')).toBeNull();
  });

  it('never treats a zero quantity as one', () => {
    expect(parseLine('0 pommes')?.quantity).toBeNull();
  });
});

describe('splitLines and fold', () => {
  it('splits on lines, semicolons and comma-space, not on decimal commas', () => {
    expect(splitLines('1,5 kg riz, 2 oeufs; lait\n\n pain ')).toEqual(['1,5 kg riz', '2 oeufs', 'lait', 'pain']);
  });
  it('folds case, accents and plurals', () => {
    expect(fold('Tomates')).toBe(fold('tomate'));
    expect(fold('Crème fraîche')).toBe(fold('creme fraiche'));
    expect(fold('Riz')).not.toBe(fold('Ris'));
  });
});
