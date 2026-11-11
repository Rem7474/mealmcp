/** Money is handled in integer cents (or, for unit prices, fractional cents per base unit). */
export const toCents = (amount: number): number => Math.round(amount * 100);

/**
 * Last known price of a product, in cents per 1 `unit`, or null when we have none
 * in that unit. Prices are only comparable with quantities in the same unit.
 */
export function unitCostCents(product: { unitPrice: number | null; priceUnit: string | null }, unit: string): number | null {
  return product.unitPrice != null && product.priceUnit === unit ? product.unitPrice : null;
}
