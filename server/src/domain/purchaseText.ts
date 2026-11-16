/**
 * Reads what a person types after shopping ("2 kg tomatoes, 6 eggs 2.40€, milk 1,15 €") into lines, without any model.
 * Each line may hold a quantity with a unit, a price and a barcode, in any order, around the product name.
 */
export interface ParsedLine {
  text: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Line total in major units (what it cost), when one was written. */
  price: number | null;
  barcode: string | null;
}

const num = (s: string) => Number(s.replace(',', '.'));
const PRICE = /(?:€\s*(\d+(?:[.,]\d{1,2})?))|(?:(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:o|os)?(?![\p{L}])))/iu;
const BARCODE = /(?<![\d.,])\d{8,14}(?![\d.,])/;
/** EAN-8 or EAN-13/GTIN-14 lengths: 9 to 11 digits is a quantity or a price, not a barcode. */
const isBarcode = (digits: string) => digits.length === 8 || digits.length >= 12;
const UNITS = 'kilos?|kg|grammes?|gr|g|mg|ml|cl|dl|litres?|liters?|l|pi[eè]ces?|pieces?|pcs?|x|u';
const QUANTITY = new RegExp(String.raw`(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)\s*(${UNITS})?(?![\p{L}\d])`, 'iu');
const UNIT_NAMES: Record<string, string> = {
  kilo: 'kg',
  kilos: 'kg',
  gramme: 'g',
  grammes: 'g',
  gr: 'g',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
};
const LEADING_PARTICLE = /^(?:(?:de la|du|des|de|of|the)\s+|(?:de l|d)['’])/iu;

export function parseLine(raw: string): ParsedLine | null {
  let rest = raw.trim();
  if (!rest) return null;
  const text = rest;

  let barcode: string | null = null;
  const code = rest.match(BARCODE);
  if (code && isBarcode(code[0])) {
    barcode = code[0];
    rest = rest.replace(code[0], ' ');
  }

  let price: number | null = null;
  const p = rest.match(PRICE);
  if (p) {
    price = num(p[1] ?? p[2]);
    rest = rest.replace(p[0], ' ');
  }

  let quantity: number | null = null;
  let unit: string | null = null;
  const q = rest.match(QUANTITY);
  if (q) {
    quantity = num(q[1]);
    const u = q[2]?.toLowerCase();
    unit = u && !['x', 'u', 'pc', 'pcs'].includes(u) && !/^pi[eè]ces?$|^pieces?$/.test(u) ? (UNIT_NAMES[u] ?? u) : null;
    rest = rest.replace(q[0], ' ');
  }

  const name = rest
    .replace(/[()[\]*•\-–—:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_PARTICLE, '')
    .trim();
  if (!name && !barcode) return null;
  if (quantity !== null && !(quantity > 0)) quantity = null;
  return { text, name, quantity, unit, price, barcode };
}

/** One line per entry: newlines and semicolons always split, a comma only when a space follows (1,5 kg stays whole). */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|;|,\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** A name reduced to what identifies it: no case, accents or plural marks ("Tomates" and "tomate" match). */
export function fold(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
    .join(' ');
}
