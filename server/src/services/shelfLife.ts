import { addDays } from '../domain/dates.js';

/** What the shelf-life rules need to know about a stock line. */
export interface ShelfLifeLine {
  /** The date printed on the pack, or the stored expiry of a line that was never opened. */
  expiresOn: string | null;
  openedOn: string | null;
}

/** What the shelf-life rules need to know about a product. */
export interface ShelfLifeProduct {
  openedShelfLifeDays?: number | null;
}

/** When an opened pack must be finished: the product's opened shelf life, but never later than the printed date. */
export function openedExpiry(shelfLifeDays: number | null | undefined, openedOn: string, printed: string | null): string | null {
  if (!shelfLifeDays) return printed;
  const limit = addDays(openedOn, shelfLifeDays);
  return printed && printed < limit ? printed : limit;
}

/**
 * The date a line should be used by. Pure: no database, no clock. New rules (use-by, freezing, thawing) are added
 * here, so the callers that store the result do not change.
 */
export function effectiveExpiry(line: ShelfLifeLine, product: ShelfLifeProduct): string | null {
  if (line.openedOn) return openedExpiry(product.openedShelfLifeDays, line.openedOn, line.expiresOn);
  return line.expiresOn;
}
