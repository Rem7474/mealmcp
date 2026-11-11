/**
 * Quantities are stored in a base unit so that stock, recipes and shopping can
 * be added and compared: grams for mass, millilitres for volume, and the unit
 * as given (lower-cased) for everything else.
 */
const FACTORS: Record<string, { unit: string; factor: number }> = {
  mg: { unit: 'g', factor: 0.001 },
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
  // Kitchen measures, converted to ml (metric spoons and cups).
  tsp: { unit: 'ml', factor: 5 },
  teaspoon: { unit: 'ml', factor: 5 },
  cc: { unit: 'ml', factor: 5 },
  'c. à café': { unit: 'ml', factor: 5 },
  'c à café': { unit: 'ml', factor: 5 },
  'cuillère à café': { unit: 'ml', factor: 5 },
  tbsp: { unit: 'ml', factor: 15 },
  tablespoon: { unit: 'ml', factor: 15 },
  cs: { unit: 'ml', factor: 15 },
  'c. à soupe': { unit: 'ml', factor: 15 },
  'c à soupe': { unit: 'ml', factor: 15 },
  'cuillère à soupe': { unit: 'ml', factor: 15 },
  cup: { unit: 'ml', factor: 240 },
  cups: { unit: 'ml', factor: 240 },
};

const PIECE_ALIASES = new Set(['', 'piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'x', 'u', 'pièce', 'pièces', 'unité', 'unités']);

export const DEFAULT_UNIT = 'piece';

export function normalizeUnit(unit?: string | null): string {
  const u = (unit ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (PIECE_ALIASES.has(u)) return DEFAULT_UNIT;
  return FACTORS[u]?.unit ?? u;
}

export function toBase(quantity: number, unit?: string | null): { quantity: number; unit: string } {
  const u = (unit ?? '').trim().toLowerCase().replace(/\.$/, '');
  const f = FACTORS[u];
  if (f) return { quantity: round(quantity * f.factor), unit: f.unit };
  return { quantity: round(quantity), unit: normalizeUnit(u) };
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
