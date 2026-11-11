/** Dates are handled as ISO YYYY-MM-DD strings, in the server's local time zone. */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function today(): string {
  return iso(new Date());
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return iso(new Date(y, m - 1, d + days));
}
