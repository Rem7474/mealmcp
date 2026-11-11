import { type Conversions, convertQuantity } from './convert.js';

/** Money is handled in integer cents (or, for unit prices, fractional cents per base unit). */
export const toCents = (amount: number): number => Math.round(amount * 100);

type Priced = { unitPrice: number | null; priceUnit: string | null } & Conversions;

/**
 * What `quantity` `unit` of a product costs, in (fractional) cents, from its last known price.
 * Works across g / ml / piece when the product has the needed conversion; null when unknown.
 */
export function costCents(product: Priced, quantity: number, unit: string): number | null {
  if (product.unitPrice === null || product.priceUnit === null) return null;
  const inPriceUnit = convertQuantity(quantity, unit, product.priceUnit, product);
  return inPriceUnit === null ? null : inPriceUnit * product.unitPrice;
}
