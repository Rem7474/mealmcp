import type { Location, MealType } from './types';

export const LOCATION_LABELS: Record<Location, string> = { fridge: 'Frigo', freezer: 'Congélateur', pantry: 'Placard' };
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  snack: 'Goûter',
  dinner: 'Dîner',
};

const num = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/** Quantities are stored in g / ml / pièce; show them in the most readable unit. */
export function formatQty(quantity: number | null, unit: string): string {
  if (quantity == null) return '';
  if (unit === 'g' && quantity >= 1000) return `${num(quantity / 1000)} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${num(quantity / 1000)} l`;
  if (unit === 'pièce') return num(quantity);
  return `${num(quantity)} ${unit}`;
}

export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const today = () => toIso(new Date());

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Monday of the week containing the given date. */
export function weekStart(iso: string): string {
  const d = fromIso(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export const formatDay = (iso: string) =>
  fromIso(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });

export const formatDate = (iso: string) => fromIso(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function daysUntil(iso: string): number {
  return Math.round((fromIso(iso).getTime() - fromIso(today()).getTime()) / 86_400_000);
}
