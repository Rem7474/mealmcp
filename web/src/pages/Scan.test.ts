import { describe, expect, it } from 'vitest';
import { canScan, cleanCode, isCode } from './Scan';

describe('barcode input', () => {
  it('keeps only the digits of what is typed or pasted', () => {
    expect(cleanCode(' 3017 6204-22003 ')).toBe('3017620422003');
  });
  it('accepts 6 to 14 digits', () => {
    expect(isCode('96385074')).toBe(true);
    expect(isCode('12345')).toBe(false);
    expect(isCode('123456789012345')).toBe(false);
    expect(isCode('abc12345')).toBe(false);
  });
  it('needs the browser detector and a camera, so it is off where they are missing', () => {
    expect(canScan()).toBe(false);
  });
});
