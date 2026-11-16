import { addDays } from '../domain/dates.js';

/** What the shelf-life rules need to know about a stock line. */
export interface ShelfLifeLine {
  /** The date the line is used by today (stored: the printed date, or what the rules made of it once opened). */
  expiresOn: string | null;
  /** The date printed on the pack. Null on lines that predate the column: see printedDate. */
  printedExpiresOn?: string | null;
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
 * The date printed on the pack. Lines opened before the column existed have none: their stored expiry is the printed
 * date unless it is exactly what the opened shelf life gives, in which case the printed date is unknown.
 */
export function printedDate(line: ShelfLifeLine, product: ShelfLifeProduct): string | null {
  if (line.printedExpiresOn !== undefined && line.printedExpiresOn !== null) return line.printedExpiresOn;
  if (line.openedOn && product.openedShelfLifeDays && line.expiresOn === addDays(line.openedOn, product.openedShelfLifeDays)) return null;
  return line.expiresOn;
}

/**
 * The date a line should be used by. Pure: no database, no clock. New rules (use-by, freezing, thawing) are added
 * here, so the callers that store the result do not change.
 */
export function effectiveExpiry(line: ShelfLifeLine, product: ShelfLifeProduct): string | null {
  const printed = printedDate(line, product);
  if (line.openedOn) return openedExpiry(product.openedShelfLifeDays, line.openedOn, printed);
  return printed;
}
