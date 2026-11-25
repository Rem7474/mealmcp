import type { z } from 'zod';
import { normalizeGtin, numericPackSize, type PackSize, parsePackSize } from '../domain/barcode.js';
import { ValidationError } from '../domain/errors.js';
import { fromOpenFoodFacts, type NutrientValues } from '../domain/nutrition.js';
import type { stockAddFromCode } from '../domain/schemas/catalog.js';
import type { stockAdd } from '../domain/schemas.js';
import type { ProductService } from './products.js';
import type { StockService } from './stock.js';

const USER_AGENT = 'MealMCP (self-hosted meal planner; https://github.com/Rem7474/mealmcp)';
const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

export type Fetch = typeof fetch;

/** What the catalogue says about one item. Nothing here is stored until someone chooses to keep it. */
export interface CatalogHit {
  code: string;
  name: string;
  /** The generic name ("Spaghetti"), when the catalogue has one different from the name. */
  genericName: string | null;
  /** The first brand, and all of them as the catalogue lists them. */
  brand: string | null;
  brands: string | null;
  /** Size of one pack when it is a mass or a volume (a count like "4 slices" gives null). */
  packSize: PackSize | null;
  /** Calories and macros per 100 g, only when the catalogue has them. */
  per100: NutrientValues | null;
}

interface RawProduct {
  code?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string[] | string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  nutriments?: unknown;
  [localised: string]: unknown;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Reads one catalogue entry; null when it has no name or no usable code. */
export function toHit(raw: RawProduct | null | undefined, lang?: string): CatalogHit | null {
  if (!raw) return null;
  const code = normalizeGtin(String(raw.code ?? ''));
  const name = (lang && text(raw[`product_name_${lang}`])) || text(raw.product_name);
  if (!code || !name) return null;
  const generic = (lang && text(raw[`generic_name_${lang}`])) || text(raw.generic_name);
  const list = Array.isArray(raw.brands) ? raw.brands : typeof raw.brands === 'string' ? raw.brands.split(',') : [];
  const brands = list.map((b) => String(b).trim()).filter(Boolean);
  return {
    code,
    name,
    genericName: generic && generic.toLowerCase() !== name.toLowerCase() ? generic : null,
    brand: brands[0] ?? null,
    brands: brands.join(', ') || null,
    packSize: numericPackSize(raw.product_quantity, raw.product_quantity_unit) ?? parsePackSize(raw.quantity),
    per100: fromOpenFoodFacts(raw.nutriments),
  };
}

const LANG = /^[a-z]{2}$/;
const fieldsFor = (lang?: string) => {
  const base = ['code', 'product_name', 'generic_name', 'brands', 'quantity', 'product_quantity', 'product_quantity_unit', 'nutriments'];
  return (lang && LANG.test(lang) ? [...base, `product_name_${lang}`, `generic_name_${lang}`] : base).join(',');
};

/** Lookups a household may make per minute: a guard against an assistant stuck in a loop, kept under the catalogue's own limits. */
const LIMIT = 30;
const WINDOW_MS = 60_000;
const recent = new Map<number, number[]>();
const spend = (household: number, now = Date.now()) => {
  const calls = (recent.get(household) ?? []).filter((t) => now - t < WINDOW_MS);
  if (calls.length >= LIMIT)
    throw new ValidationError('Too many catalogue lookups in a minute. Try again shortly, or type the details by hand.');
  calls.push(now);
  recent.set(household, calls);
  // Households that have not looked anything up for a minute have nothing left to remember.
  if (recent.size > 1000) for (const [h, times] of recent) if (times.every((t) => now - t >= WINDOW_MS)) recent.delete(h);
};
/** For tests: forget the lookups counted so far. */
export const resetCatalogLimit = () => recent.clear();

async function getJson(fetchImpl: Fetch, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new ValidationError('Open Food Facts cannot be reached right now. Try again later, or type the values by hand.');
  }
  if (res.status === 404) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('json'))
    throw new ValidationError('Open Food Facts is not available right now. Try again later, or type the values by hand.');
  return res.json();
}

/**
 * The only door to Open Food Facts. Only a barcode or the searched text leaves the server, never anything about the
 * household. Both the product catalogue and the nutrition module go through it.
 */
export function createCatalogClient(fetchImpl: Fetch, household: number) {
  return {
    /** One item by barcode; null when the catalogue does not know it. */
    async product(code: string, lang?: string): Promise<CatalogHit | null> {
      const gtin = normalizeGtin(code);
      if (!gtin) throw new ValidationError('Expected a barcode (digits only)');
      spend(household);
      const body = (await getJson(fetchImpl, `${PRODUCT_URL}/${encodeURIComponent(gtin)}.json?fields=${fieldsFor(lang)}`)) as {
        product?: RawProduct;
      } | null;
      return toHit(body?.product ? { ...body.product, code: body.product.code ?? gtin } : null, lang);
    },

    /** Up to eight candidates for a name. */
    async search(query: string, lang?: string): Promise<CatalogHit[]> {
      spend(household);
      const body = (await getJson(fetchImpl, `${SEARCH_URL}?q=${encodeURIComponent(query)}&page_size=8&fields=${fieldsFor(lang)}`)) as {
        hits?: RawProduct[];
      } | null;
      const seen = new Set<string>();
      const hits: CatalogHit[] = [];
      for (const raw of body?.hits ?? []) {
        const hit = toHit(raw, lang);
        if (!hit || seen.has(hit.code)) continue;
        seen.add(hit.code);
        hits.push(hit);
      }
      return hits;
    },
  };
}

export type CatalogClient = ReturnType<typeof createCatalogClient>;

/** Where a catalogue entry already stands in this household. */
export interface KnownAs {
  productId: number;
  productName: string;
  /** Size of one pack saved on our side for this code. */
  packSize: number | null;
  unit: string | null;
}

/**
 * The catalogue seen from the household: what a code or a name is, what the household already has for it and
 * which of its products it most likely belongs to. Looking up never writes; only `addStock` does, and only once
 * the code is tied to a product.
 */
export function createCatalogService(household: number, products: ProductService, stock: StockService, fetchImpl: Fetch = fetch) {
  const client = createCatalogClient(fetchImpl, household);
  const knownAs = (code: string): KnownAs | null => {
    const found = products.findByBarcode(code);
    return found
      ? { productId: found.product.id, productName: found.product.name, packSize: found.barcode.packSize, unit: found.barcode.unit }
      : null;
  };
  /** Household products that go by the name or the generic name of a hit. */
  const matches = (hit: CatalogHit) => {
    const seen = new Map<number, string>();
    for (const name of [hit.name, hit.genericName]) {
      const p = name ? products.findByName(name) : undefined;
      if (p) seen.set(p.id, p.name);
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  };

  const svc = {
    /** One item by barcode: what we already know, else the catalogue's answer and the products it could belong to. */
    async product(code: string, lang?: string) {
      const gtin = normalizeGtin(code);
      if (!gtin) throw new ValidationError('Expected a barcode (digits only)');
      const known = knownAs(gtin);
      if (known) return { code: gtin, known, hit: null as CatalogHit | null, suggestions: [] as { id: number; name: string }[] };
      const hit = await client.product(gtin, lang);
      return { code: gtin, known: null, hit, suggestions: hit ? matches(hit) : [] };
    },

    /** Candidates for a name, each marked with the product the household already ties its code to, if any. */
    async search(query: string, lang?: string) {
      const hits = await client.search(query, lang);
      return hits.map((hit) => ({ ...hit, known: knownAs(hit.code), suggestions: matches(hit) }));
    },

    /**
     * Adds to the stock what a barcode stands for. The code settles the product (seen before, matched by name or
     * alias, or the `name` given) and the pack size; a name alone never creates anything here.
     */
    async addStock({ barcode, name, lang, ...rest }: z.input<typeof stockAddFromCode>) {
      const gtin = normalizeGtin(barcode);
      if (!gtin) throw new ValidationError('Expected a barcode (digits only)');
      let product: { id: number; name: string };
      let packSize: number | null;
      let unit: string | null;
      const local = products.findByBarcode(gtin);
      if (local) {
        if (name) {
          const named = products.findByName(name);
          if (named && named.id !== local.product.id)
            throw new ValidationError(`That barcode already belongs to "${local.product.name}", not to "${named.name}"`);
        }
        product = local.product;
        ({ packSize, unit } = local.barcode);
      } else {
        let hit: CatalogHit | null = null;
        try {
          hit = await client.product(gtin, lang);
        } catch (e) {
          if (!name) throw e; // The name is enough to go on when the catalogue is out of reach.
        }
        const target = name ? products.findOrCreate(name, rest.unit ?? hit?.packSize?.unit) : hit ? matches(hit)[0] : undefined;
        if (!target) {
          const what = hit ? `"${hit.name}"${hit.brand ? ` (${hit.brand})` : ''}` : 'unknown to the catalogue';
          throw new ValidationError(
            `Barcode ${gtin} is ${what} and matches none of your products. Add it again with a name to attach it to a product (existing or new).`,
          );
        }
        const id = target.id;
        products.attachBarcode(id, gtin, {
          brand: hit?.brand ?? null,
          packSize: hit?.packSize?.size ?? null,
          unit: hit?.packSize?.unit ?? null,
          label: hit?.name ?? null,
        });
        products.ensureAlias(id, hit?.name);
        products.ensureAlias(id, hit?.genericName);
        product = { id, name: target.name };
        packSize = hit?.packSize?.size ?? null;
        unit = hit?.packSize?.unit ?? null;
      }
      // The size saved for this code fills what the caller left out: "one pack" when no quantity was given.
      const base: z.input<typeof stockAdd> = { ...rest, name: product.name };
      const known = packSize && unit ? { packSize, unit } : null;
      const wantsOnePack = known && rest.quantity === undefined && !rest.approximate && rest.packSize === undefined;
      const input: z.input<typeof stockAdd> = !known
        ? base
        : wantsOnePack
          ? { ...base, ...known, packCount: rest.packCount ?? 1 }
          : rest.packCount !== undefined && rest.packSize === undefined
            ? { ...base, ...known }
            : base;
      return stock.add(input);
    },
  };
  return svc;
}

export type CatalogService = ReturnType<typeof createCatalogService>;
