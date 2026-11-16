import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/index.js';
import { households } from '../db/schema.js';
import { createCatalogClient, createCatalogService, resetCatalogLimit, toHit } from './catalog.js';
import { createServices, type Services } from './index.js';

let db: Db;
let svc: Services;
const newHousehold = () => db.insert(households).values({ name: 'H', createdAt: Date.now() }).returning().get().id;
beforeEach(() => {
  resetCatalogLimit();
  db = createDb(':memory:');
  svc = createServices(db, newHousehold());
});

const SPAGHETTI = {
  code: '8076800195057',
  product_name: 'Spaghetti n°5 Barilla',
  generic_name: 'Pâtes alimentaires',
  brands: 'Barilla',
  quantity: '500 g',
  product_quantity: 500,
  product_quantity_unit: 'g',
};
const SMALL = { ...SPAGHETTI, code: '8076800105056', quantity: '400 g', product_quantity: 400 };

/** A catalogue that knows some items and records every address it is asked for. */
function fakeCatalogue(items: Record<string, object>, { down = false }: { down?: boolean } = {}) {
  const urls: string[] = [];
  const f = (async (url: string) => {
    urls.push(String(url));
    if (down) throw new Error('offline');
    const u = new URL(String(url));
    const code = decodeURIComponent(u.pathname.split('/').pop() ?? '').replace('.json', '');
    const body = u.pathname.includes('/api/v2/product/') ? (items[code] ? { product: items[code] } : null) : { hits: Object.values(items) };
    if (!body) return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, urls };
}
const catalogFor = (s: Services, hid: number, f: typeof fetch) => createCatalogService(hid, s.products, s.stock, f);
const hidOf = () => db.select().from(households).get()!.id;

describe('catalogue entries', () => {
  it('reads names, brands and the pack size, preferring the numeric fields', () => {
    expect(toHit({ ...SPAGHETTI, product_name_fr: 'Spaghetti 5', generic_name_fr: 'Pâtes' }, 'fr')).toMatchObject({
      code: '8076800195057',
      name: 'Spaghetti 5',
      genericName: 'Pâtes',
      brand: 'Barilla',
      packSize: { size: 500, unit: 'g', count: 1 },
      per100: null,
    });
    expect(toHit({ code: '1234567', product_name: 'Rice', generic_name: 'rice', quantity: '1 kg' })).toMatchObject({
      genericName: null,
      packSize: { size: 1000, unit: 'g' },
    });
    expect(toHit({ code: '1234567', product_name: 'Bread', quantity: '4 slices' })?.packSize).toBeNull();
  });

  it('skips entries without a name or a valid code', () => {
    expect(toHit({ code: '1234567' })).toBeNull();
    expect(toHit({ code: 'x', product_name: 'Rice' })).toBeNull();
    expect(toHit(null)).toBeNull();
  });
});

describe('looking a code or a name up', () => {
  it('suggests the household product that goes by the name or generic name, and sends only the code', async () => {
    svc.products.findOrCreate('Pâtes alimentaires');
    const cat = fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI });
    const found = await catalogFor(svc, hidOf(), cat.f).product(SPAGHETTI.code);
    expect(found.known).toBeNull();
    expect(found.hit).toMatchObject({ name: 'Spaghetti n°5 Barilla', packSize: { size: 500 } });
    expect(found.suggestions.map((s) => s.name)).toEqual(['Pâtes alimentaires']);
    expect(cat.urls).toHaveLength(1);
    expect(cat.urls[0]).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/8076800195057\.json\?fields=[a-z_,]+$/);
    expect(svc.products.list()).toHaveLength(1); // nothing was created
  });

  it('answers from what is known, without asking the catalogue', async () => {
    const pasta = svc.products.findOrCreate('Pasta');
    svc.products.attachBarcode(pasta.id, '012345678905', { packSize: 500, unit: 'g' });
    const cat = fakeCatalogue({});
    const found = await catalogFor(svc, hidOf(), cat.f).product('0012345678905'); // the same code as EAN-13
    expect(found.known).toMatchObject({ productName: 'Pasta', packSize: 500, unit: 'g' });
    expect(cat.urls).toHaveLength(0);
  });

  it('searches by name, marking what the household already ties to a code, and sends only the text', async () => {
    const pasta = svc.products.findOrCreate('Pasta');
    svc.products.attachBarcode(pasta.id, SPAGHETTI.code);
    const cat = fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI, [SMALL.code]: SMALL });
    const hits = await catalogFor(svc, hidOf(), cat.f).search('spaghetti barilla', 'fr');
    expect(hits.map((h) => h.code)).toEqual([SPAGHETTI.code, SMALL.code]);
    expect(hits[0]?.known).toMatchObject({ productName: 'Pasta' });
    expect(hits[1]?.known).toBeNull();
    const url = new URL(cat.urls[0] as string);
    expect(url.origin + url.pathname).toBe('https://search.openfoodfacts.org/search');
    expect([...url.searchParams.keys()].sort()).toEqual(['fields', 'page_size', 'q']);
    expect(url.searchParams.get('q')).toBe('spaghetti barilla');
  });

  it('works without any nutrition values and with the nutrition module off', async () => {
    expect(svc.settings.get().nutrition?.enabled).toBeFalsy();
    const found = await catalogFor(svc, hidOf(), fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI }).f).product(SPAGHETTI.code);
    expect(found.hit?.per100).toBeNull();
  });

  it('refuses a malformed code and reports an unreachable catalogue', async () => {
    const down = catalogFor(svc, hidOf(), fakeCatalogue({}, { down: true }).f);
    await expect(down.product('abc')).rejects.toThrow(/barcode/);
    await expect(down.product(SPAGHETTI.code)).rejects.toThrow(/cannot be reached/);
  });

  it('stops an assistant stuck in a loop after thirty lookups in a minute', async () => {
    const client = createCatalogClient(fakeCatalogue({}).f, hidOf());
    for (let i = 0; i < 30; i++) await client.search('rice');
    await expect(client.search('rice')).rejects.toThrow(/Too many/);
    // Another household is not slowed down by it.
    await expect(createCatalogClient(fakeCatalogue({}).f, 9999).search('rice')).resolves.toEqual([]);
  });
});

describe('adding to the stock from a barcode', () => {
  const lines = () => svc.stock.list({}).filter((l) => l.name === 'Pasta');

  it('attaches a new code to the named product, with its size, aliases and brand, and stocks one pack', async () => {
    const cat = fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI });
    const catalog = catalogFor(svc, hidOf(), cat.f);
    await catalog.addStock({ barcode: SPAGHETTI.code, name: 'Pasta', location: 'pantry' });
    const pasta = svc.products.findByName('Pasta')!;
    const full = svc.products.get(pasta.id);
    expect(full.barcodes).toEqual([{ code: SPAGHETTI.code, brand: 'Barilla', packSize: 500, unit: 'g', label: 'Spaghetti n°5 Barilla' }]);
    expect(full.barcode).toBe(SPAGHETTI.code);
    expect(full.brand).toBe('Barilla');
    expect(full.aliases.sort()).toEqual(['Pâtes alimentaires', 'Spaghetti n°5 Barilla']);
    expect(lines()).toMatchObject([{ quantity: 500, unit: 'g', packSize: 500 }]);
  });

  it('recognises a code it has seen without asking the catalogue, and adds to the same line', async () => {
    const cat = fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI });
    const catalog = catalogFor(svc, hidOf(), cat.f);
    await catalog.addStock({ barcode: SPAGHETTI.code, name: 'Pasta' });
    await catalog.addStock({ barcode: SPAGHETTI.code, packCount: 2 });
    expect(cat.urls).toHaveLength(1);
    expect(lines()).toMatchObject([{ quantity: 1500, packSize: 500 }]);
  });

  it('keeps two formats of one product apart, each with its own code', async () => {
    const catalog = catalogFor(svc, hidOf(), fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI, [SMALL.code]: SMALL }).f);
    await catalog.addStock({ barcode: SPAGHETTI.code, name: 'Pasta' });
    await catalog.addStock({ barcode: SMALL.code, name: 'Pasta' });
    expect(svc.products.list().filter((p) => p.name === 'Pasta')).toHaveLength(1);
    expect(svc.products.findByName('Pasta')).toBeDefined();
    expect(
      lines()
        .map((l) => l.packSize)
        .sort(),
    ).toEqual([400, 500]);
    expect(svc.products.get(svc.products.findByName('Pasta')!.id).barcodes.map((b) => b.packSize)).toEqual([500, 400]);
  });

  it('proposes the existing product that matches the catalogue name instead of making a new one', async () => {
    svc.products.findOrCreate('Pâtes alimentaires');
    const catalog = catalogFor(svc, hidOf(), fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI }).f);
    await catalog.addStock({ barcode: SPAGHETTI.code });
    expect(svc.products.list().map((p) => p.name)).toEqual(['Pâtes alimentaires']);
    expect(svc.stock.list({})).toHaveLength(1);
  });

  it('never creates a product from a name that matches none: it asks for one', async () => {
    const catalog = catalogFor(svc, hidOf(), fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI }).f);
    await expect(catalog.addStock({ barcode: SPAGHETTI.code })).rejects.toThrow(/matches none of your products/);
    expect(svc.products.list()).toHaveLength(0);
    expect(svc.stock.list({})).toHaveLength(0);
  });

  it('does not stock a code the catalogue does not know either', async () => {
    const catalog = catalogFor(svc, hidOf(), fakeCatalogue({}).f);
    await expect(catalog.addStock({ barcode: '4006381333931' })).rejects.toThrow(/unknown to the catalogue/);
  });

  it('refuses a name that contradicts the product the code belongs to', async () => {
    const catalog = catalogFor(svc, hidOf(), fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI }).f);
    await catalog.addStock({ barcode: SPAGHETTI.code, name: 'Pasta' });
    svc.products.findOrCreate('Rice');
    await expect(catalog.addStock({ barcode: SPAGHETTI.code, name: 'Rice' })).rejects.toThrow(/already belongs to "Pasta"/);
  });

  it('goes on with the name when the catalogue is out of reach, and asks for one when it is not given', async () => {
    const catalog = catalogFor(svc, hidOf(), fakeCatalogue({}, { down: true }).f);
    await catalog.addStock({ barcode: SPAGHETTI.code, name: 'Pasta', quantity: 250, unit: 'g' });
    expect(lines()).toMatchObject([{ quantity: 250 }]);
    expect(svc.products.get(svc.products.findByName('Pasta')!.id).barcodes).toMatchObject([{ code: SPAGHETTI.code, packSize: null }]);
    await expect(catalog.addStock({ barcode: '4006381333931' })).rejects.toThrow(/cannot be reached/);
  });

  it('keeps a quantity given by hand and the size saved on our side over the catalogue', async () => {
    const pasta = svc.products.findOrCreate('Pasta', 'g');
    svc.products.attachBarcode(pasta.id, SPAGHETTI.code, { packSize: 450, unit: 'g' }); // the catalogue says 500
    const catalog = catalogFor(svc, hidOf(), fakeCatalogue({ [SPAGHETTI.code]: SPAGHETTI }).f);
    await catalog.addStock({ barcode: SPAGHETTI.code, packCount: 2 });
    await catalog.addStock({ barcode: SPAGHETTI.code, quantity: 100, unit: 'g' });
    expect(
      lines()
        .map((l) => l.quantity)
        .sort((a, b) => a - b),
    ).toEqual([100, 900]);
  });

  it('keeps the barcodes of two households apart', async () => {
    const other = createServices(db, newHousehold());
    const mine = svc.products.findOrCreate('Pasta');
    svc.products.attachBarcode(mine.id, SPAGHETTI.code);
    expect(other.products.findByBarcode(SPAGHETTI.code)).toBeUndefined();
    const theirs = other.products.findOrCreate('Noodles');
    expect(() => other.products.attachBarcode(theirs.id, SPAGHETTI.code)).not.toThrow(); // free in their household
    expect(other.products.get(theirs.id).barcodes).toHaveLength(1);
    expect(svc.products.get(mine.id).barcodes).toHaveLength(1);
    expect(() => other.products.attachBarcode(mine.id, '4006381333931')).toThrow(/not found/i);
  });
});

describe('barcodes on products', () => {
  it('tie a code to one product only, and update_product links and clears them', () => {
    const a = svc.products.findOrCreate('Pasta');
    const b = svc.products.findOrCreate('Rice');
    svc.products.update({ id: a.id, barcode: '3017620422003' });
    expect(svc.products.get(a.id).barcodes.map((x) => x.code)).toEqual(['3017620422003']);
    expect(() => svc.products.update({ id: b.id, barcode: '03017620422003' })).toThrow(/already belongs to "Pasta"/);
    svc.products.update({ id: a.id, barcode: null });
    expect(svc.products.get(a.id).barcodes).toEqual([]);
    expect(svc.products.get(a.id).barcode).toBeNull();
  });

  it('are listed with their product', () => {
    const a = svc.products.findOrCreate('Pasta');
    svc.products.attachBarcode(a.id, '3017620422003');
    expect(svc.products.list()[0]?.barcodes).toHaveLength(1);
  });
});
