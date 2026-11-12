import { locale } from './i18n';
import type { Location, MealType } from './types';

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

export const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

export const formatDay = (iso: string) => fromIso(iso).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short' });

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

/** "€" for EUR, "$" for USD, "CHF" where there is no short symbol, following the UI language. */
export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(locale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

/** Currencies offered in the budget settings (any other ISO 4217 code a household already uses is kept). */
export const CURRENCIES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'CNY',
  'KRW',
  'INR',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'TRY',
  'BRL',
  'MXN',
  'ARS',
  'CLP',
  'ZAR',
  'MAD',
  'TND',
  'XOF',
  'XAF',
  'AED',
  'SAR',
  'ILS',
  'SGD',
  'HKD',
  'THB',
  'IDR',
  'MYR',
  'PHP',
  'VND',
];

/** "Euro (€)", "US Dollar ($)": the currency's name in the UI language with its symbol. */
export function currencyLabel(currency: string): string {
  let name = '';
  try {
    name = new Intl.DisplayNames(locale(), { type: 'currency' }).of(currency) ?? '';
  } catch {
    /* unknown code */
  }
  const symbol = currencySymbol(currency);
  return `${currency} · ${name ? `${name} ` : ''}${symbol !== currency ? `(${symbol})` : ''}`.trim();
}

export const isoMonth = (iso: string) => iso.slice(0, 7);
export const monthStart = (iso: string) => `${isoMonth(iso)}-01`;
export const formatMonth = (month: string) => fromIso(`${month}-01`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

/** Short weekday name for a JavaScript weekday number (0 = Sunday), in the UI language. */
export const weekdayName = (weekday: number) => new Date(2023, 0, 1 + weekday).toLocaleDateString(locale(), { weekday: 'short' });
