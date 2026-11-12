import { DEFAULT_UNIT } from './units.js';

/**
 * Per-product conversions between the three base units (g, ml, piece).
 * Free-form units ("can", "pack") are only comparable with themselves.
 */
export interface Conversions {
  gramsPerPiece: number | null;
  gramsPerMl: number | null;
}

type Dimension = 'g' | 'ml' | 'piece';
const dimension = (unit: string): Dimension | null => (unit === 'g' || unit === 'ml' || unit === DEFAULT_UNIT ? (unit as Dimension) : null);

function toGrams(quantity: number, from: Dimension, c: Conversions): number | null {
  if (from === 'g') return quantity;
  if (from === 'ml') return c.gramsPerMl ? quantity * c.gramsPerMl : null;
  return c.gramsPerPiece ? quantity * c.gramsPerPiece : null;
}

function fromGrams(grams: number, to: Dimension, c: Conversions): number | null {
  if (to === 'g') return grams;
  if (to === 'ml') return c.gramsPerMl ? grams / c.gramsPerMl : null;
  return c.gramsPerPiece ? grams / c.gramsPerPiece : null;
}

/**
 * Converts a quantity between base units for one product, or returns null when
 * that is not possible (different free-form units, or a conversion is missing).
 */
export function convertQuantity(quantity: number, from: string, to: string, c: Conversions): number | null {
  if (from === to) return quantity;
  const a = dimension(from);
  const b = dimension(to);
  if (!a || !b) return null;
  const grams = toGrams(quantity, a, c);
  return grams === null ? null : fromGrams(grams, b, c);
}

/** A product that is bought by net weight but cooked by drained weight (beans, tuna, sweetcorn). */
export interface Drainable {
  drainedRatio: number | null;
}

const hasRatio = (p: Drainable, unit: string) => unit === 'g' && !!p.drainedRatio && p.drainedRatio > 0;

/** Recipe frame -> stock frame: grams of drained food need more grams on the label (125 g drained = 200 g net). */
export const toNetFrame = (p: Drainable, quantity: number, unit: string) =>
  hasRatio(p, unit) ? quantity / (p.drainedRatio as number) : quantity;

/** Stock frame -> recipe frame: 200 g net of beans are 125 g drained. */
export const toDrainedFrame = (p: Drainable, quantity: number, unit: string) =>
  hasRatio(p, unit) ? quantity * (p.drainedRatio as number) : quantity;
