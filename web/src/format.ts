import type { Location, MealType } from './types';
import { locale } from './i18n';

export const LOCATIONS: Location[] = ['fridge', 'freezer', 'pantry'];
export const MEALS: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

const num = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 2 });

/** Quantities are stored in g / ml / piece; show them in the most readable unit. */
export function formatQty(quantity: number | null, unit: string): string {
  if (quantity == null) return '';
  if (unit === 'g' && quantity >= 1000) return `${num(quantity / 1000)} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${num(quantity / 1000)} l`;
  if (unit === 'piece') return num(quantity);
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
  fromIso(iso).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short' });

export const formatDate = (iso: string) => fromIso(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

export function daysUntil(iso: string): number {
  return Math.round((fromIso(iso).getTime() - fromIso(today()).getTime()) / 86_400_000);
}

/** Formats an amount in cents in the household currency, following the UI language. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`; // unknown currency code
  }
}

export const isoMonth = (iso: string) => iso.slice(0, 7);
export const monthStart = (iso: string) => `${isoMonth(iso)}-01`;
export const formatMonth = (month: string) => fromIso(`${month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

