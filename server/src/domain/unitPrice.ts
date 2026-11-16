import { type Conversions, convertQuantity } from './convert.js';

/** The unit a price is shown in: per kg, per litre or per piece, whatever suits the product. */
export type PriceUnit = 'kg' | 'l' | 'piece';

export interface ShownPrice {
  /** Cents per 1 `per`. */
  cents: number;
  per: PriceUnit;
}

type Priced = { unitPrice: number | null; priceUnit: string | null } & Conversions;

const BIG: Record<string, PriceUnit> = { g: 'kg', ml: 'l', piece: 'piece' };

/**
 * A stored price (cents per base unit) in the unit people read: g -> per kg, ml -> per litre, piece -> per piece.
 * `alt` is the same price in another unit when the product has the conversion (eggs per piece and per kg,
 * milk per litre and per kg), so that a "per piece" product can still be compared with a "per kg" one.
 */
export function shownPrice(p: Priced): { main: ShownPrice; alt: ShownPrice | null } | null {
  if (p.unitPrice === null || p.priceUnit === null || p.unitPrice <= 0) return null;
  const per = BIG[p.priceUnit];
  if (!per) return null;
  const factor = per === 'piece' ? 1 : 1000;
  const main = { cents: p.unitPrice * factor, per };
  const other = per === 'piece' ? 'g' : per === 'kg' ? 'piece' : 'g';
  // Cost of one `other` unit: the price of 1 `priceUnit` divided by how many `other` it holds.
  const held = convertQuantity(1, p.priceUnit, other, p);
  if (!held || held <= 0) return { main, alt: null };
  const altPer = BIG[other] as PriceUnit;
  return { main, alt: { cents: (p.unitPrice / held) * (altPer === 'piece' ? 1 : 1000), per: altPer } };
}

export type Trend = 'up' | 'down' | 'stable';

export interface PriceSummary {
  latest: number;
  average: number;
  min: number;
  max: number;
  /** Latest against the average of the earlier ones; null with a single observation. */
  trend: Trend | null;
  count: number;
}

/** Share of change under which a price is read as stable. */
const STABLE = 0.03;

/** Summary of prices (all in the same unit), oldest first. Null when there are none. */
export function summarize(prices: number[]): PriceSummary | null {
  if (prices.length === 0) return null;
  const latest = prices[prices.length - 1] as number;
  const earlier = prices.slice(0, -1);
  let trend: Trend | null = null;
  if (earlier.length > 0) {
    const base = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    const change = base > 0 ? (latest - base) / base : 0;
    trend = change > STABLE ? 'up' : change < -STABLE ? 'down' : 'stable';
  }
  return {
    latest,
    average: prices.reduce((a, b) => a + b, 0) / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    trend,
    count: prices.length,
  };
}

/** A latest price this far above the average (and at least 3 observations) is worth a second look. */
const HIGH = 0.15;

/** Whether the latest price is well above what the product usually costs. */
export function isHigh(s: PriceSummary | null): boolean {
  return s !== null && s.count >= 3 && s.latest > s.average * (1 + HIGH);
}
