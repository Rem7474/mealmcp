/** Dates are handled as ISO YYYY-MM-DD strings, in the server's local time zone. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function today(): string {
  return iso(new Date());
}

/** Whole days from `from` to `to` (negative when `to` is earlier); daylight saving does not shift the count. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return iso(new Date(y, m - 1, d + days));
}
