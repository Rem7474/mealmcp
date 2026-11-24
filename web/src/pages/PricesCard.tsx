import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { currencySymbol, formatMoney } from '../format';
import { useT } from '../i18n';
import type { Product } from '../types';
import { Accordion, Badge, Button, Empty, Field, Input } from '../ui';
import { ProductSheet } from './ProductSheet';
import { ProductDatalist, parseQty, TrendMark, UnitPrice, usePriceOverview, useProducts } from './shared';

/** Price of 1 kg / 1 l / 1 piece, the units people think in. */
const displayUnit = (unit: string) =>
  unit === 'g' ? { unit: 'kg', factor: 1000 } : unit === 'ml' ? { unit: 'l', factor: 1000 } : { unit, factor: 1 };

type PricedProduct = Product & { unitPrice: number; priceUnit: string };

/** Product prices: one readable row per product (name, price you can correct, what the history says about it). */
export function PricesCard({ currency }: { currency: string }) {
  const t = useT();
  const { run, pending } = useAction();
  const { data: products = [] } = useProducts();
  const overview = usePriceOverview();
  const [editing, setEditing] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [newPrice, setNewPrice] = useState({ name: '', price: '', quantity: '1', unit: '' });
  const needle = filter.trim().toLowerCase();
  const priced = products
    .filter((p): p is PricedProduct => p.unitPrice !== null && p.priceUnit !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const shownRows = needle ? priced.filter((p) => p.name.toLowerCase().includes(needle)) : priced;
  const edited = editing !== null ? (products.find((p) => p.id === editing) ?? null) : null;
  // The unit a typed name would get, so the empty field says what it will default to.
  const knownUnit = products.find((p) => p.name.toLowerCase() === newPrice.name.trim().toLowerCase())?.defaultUnit;

  const save = (product: Product, shown: { unit: string; factor: number }, value: string) => {
    const price = parseQty(value);
    if (price === undefined || Number.isNaN(price)) return;
    const current = ((product.unitPrice ?? 0) * shown.factor) / 100;
    if (Math.abs(price - current) < 0.005) return;
    void run(() => api.post('/products/price', { name: product.name, price, quantity: 1, unit: shown.unit }));
  };

  const addPrice = async (e: FormEvent) => {
    e.preventDefault();
    const price = parseQty(newPrice.price);
    const quantity = parseQty(newPrice.quantity) ?? 1;
    if (!newPrice.name.trim() || price === undefined || Number.isNaN(price) || price < 0 || Number.isNaN(quantity) || quantity <= 0) return;
    await run(() =>
      api.post('/products/price', {
        name: newPrice.name.trim(),
        price,
        quantity,
        ...(newPrice.unit.trim() ? { unit: newPrice.unit.trim() } : {}),
      }),
    );
    setNewPrice({ name: '', price: '', quantity: '1', unit: '' });
  };

  return (
    <Accordion summary={t('budget.prices.title')}>
      <ProductDatalist />
      {edited && <ProductSheet key={edited.id} product={edited} onClose={() => setEditing(null)} />}
      <p className="mt-2 text-sm text-muted">{t('budget.prices.help')}</p>
      <form onSubmit={addPrice} className="mt-3 space-y-2">
        <Field label={t('budget.prices.product')}>
          <Input
            required
            list="product-names"
            placeholder={t('products.search')}
            value={newPrice.name}
            onChange={(e) => setNewPrice({ ...newPrice, name: e.target.value })}
            className="w-full"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label={`${t('products.price')} (${currencySymbol(currency)})`}>
            <Input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={newPrice.price}
              onChange={(e) => setNewPrice({ ...newPrice, price: e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label={t('budget.prices.for')}>
            <Input
              inputMode="decimal"
              value={newPrice.quantity}
              onChange={(e) => setNewPrice({ ...newPrice, quantity: e.target.value })}
              className="w-full"
            />
          </Field>
          <Field label={t('common.unit')}>
            <Input
              list="unit-names"
              placeholder={knownUnit ?? t('common.unit')}
              value={newPrice.unit}
              onChange={(e) => setNewPrice({ ...newPrice, unit: e.target.value })}
              className="w-full"
            />
          </Field>
        </div>
        <p className="text-xs text-muted">{t('budget.prices.formHint')}</p>
        <Button type="submit" disabled={pending}>
          {t('budget.prices.add')}
        </Button>
      </form>
      {priced.length === 0 ? (
        <Empty>{t('budget.prices.empty')}</Empty>
      ) : (
        <>
          <Input
            type="search"
            aria-label={t('budget.prices.search')}
            placeholder={t('budget.prices.search')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-4 w-full"
          />
          <p className="mt-2 text-xs text-muted">{t('budget.prices.legend')}</p>
          {shownRows.length === 0 ? (
            <Empty>{t('budget.prices.noMatch')}</Empty>
          ) : (
            <ul className="mt-1 divide-y divide-line text-sm">
              {shownRows.map((p) => {
                const shown = displayUnit(p.priceUnit);
                const info = overview.get(p.id);
                const average =
                  info && info.per !== null && info.averageCents !== null && info.count > 1
                    ? t('price.per', { price: formatMoney(info.averageCents, currency), unit: t(`price.unit.${info.per}`) })
                    : null;
                return (
                  <li key={p.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(p.id)}
                        className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-accent hover:underline"
                      >
                        {p.name}
                      </button>
                      {/* A fixed slot, so the inputs line up whether or not a trend is known. */}
                      <span className="w-4 text-center">
                        <TrendMark trend={info?.trend} />
                      </span>
                      <Input
                        key={p.unitPrice}
                        defaultValue={((p.unitPrice * shown.factor) / 100).toFixed(2)}
                        inputMode="decimal"
                        aria-label={t('budget.prices.aria', { name: p.name, unit: shown.unit })}
                        onBlur={(e) => save(p, shown, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        className="h-8 w-20 shrink-0 px-2 text-right"
                      />
                      <span className="w-20 shrink-0 truncate text-muted" title={`${currencySymbol(currency)}/${shown.unit}`}>
                        {currencySymbol(currency)}/{shown.unit === 'piece' ? '1' : shown.unit}
                      </span>
                    </div>
                    {(average || info?.cheapestStore || info?.high || p.pricePer?.alt) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        {info?.high && <Badge tone="warn">{t('price.high')}</Badge>}
                        {average && (
                          <span>
                            {t('price.average')}: {average}
                          </span>
                        )}
                        {info?.cheapestStore && <span>{t('price.cheapest', { store: info.cheapestStore })}</span>}
                        <UnitPrice price={p.pricePer?.alt} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Accordion>
  );
}
