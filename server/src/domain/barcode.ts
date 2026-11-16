import { toBase } from './units.js';

/**
 * One barcode, one spelling: UPC-A (12 digits) and EAN-13 with a leading zero are the same item, so codes
 * are padded to 13 digits. EAN-8 (8 digits) and GTIN-14 with a real indicator digit keep their length.
 * Returns null when it is not a barcode (digits only, 6 to 14 of them).
 */
export function normalizeGtin(code: string): string | null {
  const digits = code.trim();
  if (!/^\d{6,14}$/.test(digits)) return null;
  if (digits.length === 14 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 8 && digits.length < 13) return digits.padStart(13, '0');
  return digits;
}

export interface PackSize {
  /** Size of one pack in a base unit (g or ml). */
  size: number;
  unit: 'g' | 'ml';
  /** How many packs the label says it holds ("6 x 125 g" is 6 of 125). */
  count: number;
}

const UNIT = /(mg|g|gr|kg|ml|cl|dl|l)/;

/**
 * Reads the quantity text of a catalogue entry: "500 g", "1,5 kg", "75 cl", "500 g ℮", "6 x 125 g".
 * Only masses and volumes count: "4 slices" or "1 box" give null, so the field is left to the person.
 */
export function parsePackSize(text: string | null | undefined): PackSize | null {
  if (!text) return null;
  const clean = text.toLowerCase().replace(/℮/g, ' ').replace(/\s+/g, ' ').trim();
  const multi = new RegExp(`^(\\d+)\\s*[x×*]\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT.source}\\b`).exec(clean);
  const single = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${UNIT.source}\\b`).exec(clean);
  const match = multi ?? single;
  if (!match) return null;
  const count = multi ? Number(multi[1]) : 1;
  const value = Number((multi ? multi[2] : match[1]).replace(',', '.'));
  const unit = multi ? multi[3] : match[2];
  if (!Number.isFinite(value) || value <= 0 || count < 1) return null;
  const base = toBase(value, unit === 'gr' ? 'g' : unit);
  if (base.unit !== 'g' && base.unit !== 'ml') return null;
  return { size: base.quantity, unit: base.unit, count };
}

/** A numeric size from the catalogue (`product_quantity` and its unit), taken before the free text. */
export function numericPackSize(quantity: unknown, unit: unknown): PackSize | null {
  const value = typeof quantity === 'string' ? Number(quantity.replace(',', '.')) : quantity;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || typeof unit !== 'string') return null;
  const base = toBase(value, unit);
  return base.unit === 'g' || base.unit === 'ml' ? { size: base.quantity, unit: base.unit, count: 1 } : null;
}
