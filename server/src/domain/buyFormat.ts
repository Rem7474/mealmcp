import type { Location } from '../db/schema.js';

/** Units a buying format can be expressed in: the base units. */
export const FORMAT_UNITS = ['g', 'ml', 'piece'] as const;

/** Where a product goes when nobody said: chilled aisles to the fridge, frozen to the freezer, the rest to the pantry. */
export function guessLocation(category: string | null): Location {
  if (category === 'frozen') return 'freezer';
  if (category === 'dairy' || category === 'meat_fish') return 'fridge';
  return 'pantry';
}

/** Rounds an amount up to a whole number of packs; returns the quantity to buy and how many packs that is. */
export function roundToPacks(amount: number, packSize: number): { quantity: number; packs: number } {
  const packs = Math.max(1, Math.ceil(amount / packSize - 1e-9));
  return { quantity: Math.round(packs * packSize * 1000) / 1000, packs };
}
