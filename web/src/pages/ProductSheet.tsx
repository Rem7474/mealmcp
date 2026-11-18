import { X } from '@phosphor-icons/react';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { currencySymbol } from '../format';
import { type MessageKey, useT } from '../i18n';
import type { Product } from '../types';
import { Badge, Button, Field, Input, Select, Sheet } from '../ui';
import { AISLES, PriceHistoryView, parseQty, UnitPrice, useCurrency } from './shared';

/**
 * Unified product editor: identity, aisle, staple flag, thresholds, shelf life, conversions, drained weight,
 * aliases, barcodes, and price — replacing the scattered inputs across Account, Stock and Budget.
 */
export function ProductSheet({ product: p, onClose }: { product: Product; onClose: () => void }) {
  const t = useT();
  const currency = useCurrency();
  const { run, pending } = useAction();

  const [name, setName] = useState(p.name);
  const [category, setCategory] = useState(p.category ?? '');
  const [staple, setStaple] = useState(p.isStaple);
  const [brand, setBrand] = useState(p.brand ?? '');
  const [minStock, setMinStock] = useState(p.minStock !== null ? String(p.minStock) : '');
  const [openedDays, setOpenedDays] = useState(p.openedShelfLifeDays !== null ? String(p.openedShelfLifeDays) : '');
  const [frozenDays, setFrozenDays] = useState(p.frozenShelfLifeDays !== null ? String(p.frozenShelfLifeDays) : '');
  const [thawedDays, setThawedDays] = useState(p.thawedShelfLifeDays !== null ? String(p.thawedShelfLifeDays) : '');
  const [gramsPerPiece, setGramsPerPiece] = useState(p.gramsPerPiece !== null ? String(p.gramsPerPiece) : '');
  const [gramsPerMl, setGramsPerMl] = useState(p.gramsPerMl !== null ? String(p.gramsPerMl) : '');
  const [netGrams, setNetGrams] = useState(p.drainedRatio ? '100' : '');
  const [drainedGrams, setDrainedGrams] = useState(p.drainedRatio ? String(Math.round(p.drainedRatio * 1000) / 10) : '');
  const [alias, setAlias] = useState('');
  const [priceForm, setPriceForm] = useState({ price: '', quantity: '1', unit: p.priceUnit ?? p.defaultUnit });
  const [formError, setFormError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const numOrNull = (v: string) => {
      const n = parseQty(v);
      return n === undefined || Number.isNaN(n) ? null : n;
    };
    const intOrNull = (v: string) => {
      const n = numOrNull(v);
      return n === null ? null : Math.round(n);
    };
    const net = numOrNull(netGrams);
    const drained = numOrNull(drainedGrams);
    const drainedPatch =
      net === null && drained === null
        ? null
        : net !== null && drained !== null && net > 0 && drained > 0 && drained <= net
          ? { netGrams: net, drainedGrams: drained }
          : undefined;
    if (drainedPatch === undefined) {
      setFormError(t('products.drainedInvalid'));
      return;
    }
    setFormError(null);

    await run(() =>
      api.patch(`/products/${p.id}`, {
        ...(name.trim() && name.trim() !== p.name ? { name: name.trim() } : {}),
        category: category || null,
        staple,
        brand: brand.trim() || null,
        minStock: numOrNull(minStock),
        openedShelfLifeDays: intOrNull(openedDays),
        frozenShelfLifeDays: intOrNull(frozenDays),
        thawedShelfLifeDays: intOrNull(thawedDays),
        gramsPerPiece: numOrNull(gramsPerPiece),
        gramsPerMl: numOrNull(gramsPerMl),
        ...(drainedPatch !== undefined ? { drained: drainedPatch } : {}),
      }),
    );
    onClose();
  };

  const addAlias = async (e: FormEvent) => {
    e.preventDefault();
    if (!alias.trim()) return;
    await run(() => api.post('/products/alias', { name: p.name, alias: alias.trim() }));
    setAlias('');
  };

  const setPrice = async (e: FormEvent) => {
    e.preventDefault();
    const price = parseQty(priceForm.price);
    const quantity = parseQty(priceForm.quantity) ?? 1;
    if (price === undefined || Number.isNaN(price) || price < 0 || Number.isNaN(quantity) || quantity <= 0) return;
    await run(() =>
      api.post('/products/price', {
        name: p.name,
        price,
        quantity,
        unit: priceForm.unit.trim() || p.defaultUnit,
      }),
    );
    setPriceForm((f) => ({ ...f, price: '' }));
  };

  return (
    <Sheet title={p.name} onClose={onClose}>
      <div className="space-y-5">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('products.name')}>
              <Input required value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
            </Field>
            <Field label={t('products.aisle')}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full">
                <option value="">{t('aisle.none')}</option>
                {AISLES.map((c) => (
                  <option key={c} value={c}>
                    {t(`aisle.${c}` as MessageKey)}
                  </option>
                ))}
                {category && !(AISLES as readonly string[]).includes(category) && <option value={category}>{category}</option>}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('stock.brand')}>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full" />
            </Field>
            <Field label={`${t('products.minStock')} (${p.defaultUnit})`}>
              <Input inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} className="w-full" />
            </Field>
          </div>

          <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0" title={t('stock.stapleTitle')}>
            <input type="checkbox" className="size-4 accent-(--accent)" checked={staple} onChange={(e) => setStaple(e.target.checked)} />
            {t('products.staple')}
          </label>

          <div className="grid grid-cols-3 gap-2">
            <Field label={t('stock.shelfLifeLabel')}>
              <Input inputMode="numeric" value={openedDays} onChange={(e) => setOpenedDays(e.target.value)} className="w-full" />
            </Field>
            <Field label={t('stock.frozenLifeLabel')}>
              <Input inputMode="numeric" value={frozenDays} onChange={(e) => setFrozenDays(e.target.value)} className="w-full" />
            </Field>
            <Field label={t('stock.thawedLifeLabel')}>
              <Input inputMode="numeric" value={thawedDays} onChange={(e) => setThawedDays(e.target.value)} className="w-full" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('stock.gramsPerPiece')}>
              <Input inputMode="decimal" value={gramsPerPiece} onChange={(e) => setGramsPerPiece(e.target.value)} className="w-full" />
            </Field>
            <Field label={t('products.gramsPerMl')}>
              <Input inputMode="decimal" value={gramsPerMl} onChange={(e) => setGramsPerMl(e.target.value)} className="w-full" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('stock.drainedNet')}>
              <Input inputMode="decimal" value={netGrams} onChange={(e) => setNetGrams(e.target.value)} className="w-full" />
            </Field>
            <Field label={t('stock.drainedDrained')}>
              <Input inputMode="decimal" value={drainedGrams} onChange={(e) => setDrainedGrams(e.target.value)} className="w-full" />
            </Field>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}

          <Button type="submit" variant="primary" disabled={pending} className="w-full">
            {t('common.save')}
          </Button>
        </form>

        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="text-sm font-medium">{t('products.aliases')}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {p.aliases.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-md bg-ink/5 py-0.5 pr-1 pl-2 text-xs">
                {a}
                <button
                  type="button"
                  aria-label={t('products.removeAlias', { alias: a })}
                  className="cursor-pointer rounded p-0.5 text-muted hover:text-ink"
                  onClick={() => run(() => api.del(`/products/alias?alias=${encodeURIComponent(a)}`))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <form onSubmit={addAlias} className="flex gap-1.5">
              <Input
                placeholder={t('products.addAlias')}
                aria-label={t('products.addAlias')}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="h-8 w-40 px-2 text-xs"
              />
              <Button type="submit" compact disabled={pending || !alias.trim()}>
                {t('common.add')}
              </Button>
            </form>
          </div>
        </section>

        {p.barcodes.length > 0 && (
          <section className="space-y-1.5 border-t border-line pt-4">
            <h3 className="text-sm font-medium">{t('products.barcodes')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {p.barcodes.map((b) => (
                <Badge key={b.code}>
                  {b.code}
                  {b.brand ? ` · ${b.brand}` : ''}
                  {b.packSize && b.unit ? ` (${b.packSize} ${b.unit})` : ''}
                </Badge>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t('products.price')}</h3>
            <UnitPrice price={p.pricePer?.main} className="text-sm text-muted tabular-nums" />
          </div>
          <form onSubmit={setPrice} className="flex flex-wrap items-end gap-2">
            <Field label={`${t('products.price')} (${currencySymbol(currency)})`}>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={priceForm.price}
                onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                className="w-24"
              />
            </Field>
            <Field label={t('common.qty')}>
              <Input
                inputMode="decimal"
                value={priceForm.quantity}
                onChange={(e) => setPriceForm({ ...priceForm, quantity: e.target.value })}
                className="w-20"
              />
            </Field>
            <Field label={t('common.unit')}>
              <Input
                list="unit-names"
                value={priceForm.unit}
                onChange={(e) => setPriceForm({ ...priceForm, unit: e.target.value })}
                className="w-20"
              />
            </Field>
            <Button type="submit" disabled={pending || !priceForm.price.trim()}>
              {t('products.setPrice')}
            </Button>
          </form>
          <PriceHistoryView productId={p.id} />
        </section>
      </div>
    </Sheet>
  );
}
