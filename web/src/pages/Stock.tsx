import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { daysUntil, formatDate, formatQty, LOCATIONS } from '../format';
import { useT } from '../i18n';
import type { Product, StockAlerts, StockItem } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { LocationSelect, parseQty, ProductDatalist, useProducts } from './shared';

export function Stock() {
  const t = useT();
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api.get<StockItem[]>('/stock') });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<StockAlerts>('/stock/alerts') });
  const products = useProducts();
  const items = stock.data ?? [];

  return (
    <>
      <ProductDatalist />
      <AddForm />
      {alerts.data && alerts.data.lowStock.length > 0 && (
        <Card title={t('stock.lowStock')}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {alerts.data.lowStock.map((p) => (
              <li key={p.productId}>
                <Badge tone="warn">
                  {p.name}: {formatQty(p.current, p.unit) || '0'} / {formatQty(p.minStock, p.unit)}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {LOCATIONS.map((location) => {
          const here = items.filter((i) => i.location === location);
          return (
            <Card key={location} title={t(`location.${location}`)} actions={<span className="text-sm text-muted">{here.length}</span>}>
              {here.length === 0 ? (
                <Empty>{t('stock.nothingHere')}</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {here.map((item) => (
                    <StockRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      <Thresholds products={products.data ?? []} />
    </>
  );
}

function AddForm() {
  const t = useT();
  const { run, pending } = useAction();
  const [form, setForm] = useState({ name: '', quantity: '1', unit: '', location: 'fridge', expiresOn: '', approximate: false });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(() =>
      api.post('/stock', {
        name: form.name,
        quantity: form.approximate ? undefined : parseQty(form.quantity),
        approximate: form.approximate,
        unit: form.unit || undefined,
        location: form.location,
        expiresOn: form.expiresOn || null,
      }),
    );
    set({ name: '', quantity: '1', expiresOn: '' });
  };

  return (
    <Card title={t('stock.add.title')}>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input required list="product-names" placeholder={t('common.product')} aria-label={t('common.product')} value={form.name} onChange={(e) => set({ name: e.target.value })} className="flex-1 basis-40" />
        <Input required={!form.approximate} disabled={form.approximate} inputMode="decimal" placeholder={t('common.qty')} aria-label={t('common.quantity')} value={form.approximate ? '' : form.quantity} onChange={(e) => set({ quantity: e.target.value })} className="w-20" />
        <Input list="unit-names" placeholder={t('common.unit')} aria-label={t('common.unit')} value={form.unit} onChange={(e) => set({ unit: e.target.value })} className="w-24" />
        <LocationSelect value={form.location} onChange={(e) => set({ location: e.target.value })} />
        <Input type="date" aria-label={t('stock.expiry')} value={form.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-(--accent)" checked={form.approximate} onChange={(e) => set({ approximate: e.target.checked })} />
          {t('stock.approximate')}
        </label>
        <Button type="submit" variant="primary" disabled={pending}>
          {t('common.add')}
        </Button>
      </form>
    </Card>
  );
}

function StockRow({ item }: { item: StockItem }) {
  const t = useT();
  const { run } = useAction();
  const days = item.expiresOn ? daysUntil(item.expiresOn) : null;

  const saveQuantity = (value: string) => {
    const quantity = parseQty(value);
    if (quantity === undefined || Number.isNaN(quantity) || quantity === item.quantity) return;
    void run(() => api.patch(`/stock/${item.id}`, { quantity }));
  };

  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.name}</div>
        {item.expiresOn && days !== null && (
          <div className={days < 0 ? 'text-danger' : days <= 3 ? 'text-warn' : 'text-muted'}>
            {t(days < 0 ? 'stock.expired' : 'stock.useBy', { date: formatDate(item.expiresOn) })}
          </div>
        )}
      </div>
      {item.approximate ? (
        <Badge tone="accent">{t('stock.approx.badge')}</Badge>
      ) : (
        <>
          <Input
            key={item.quantity}
            defaultValue={item.quantity}
            inputMode="decimal"
            aria-label={t('stock.quantityOf', { name: item.name })}
            onBlur={(e) => saveQuantity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="h-8 w-16 px-2 text-right"
          />
          <span className="w-10 text-muted">{item.unit === 'piece' ? '' : item.unit}</span>
        </>
      )}
      <Button variant="ghost" className="h-8 px-2" aria-label={t('stock.remove', { name: item.name })} onClick={() => run(() => api.del(`/stock/${item.id}`))}>
        ✕
      </Button>
    </li>
  );
}

/**
 * Per-product settings: the minimum quantity (below it the product shows up in "Low stock" and in
 * generated shopping lists), whether it is a staple, and its weight per piece.
 */
function Thresholds({ products }: { products: Product[] }) {
  const t = useT();
  const { run } = useAction();
  if (products.length === 0) return null;

  const patch = (product: Product, change: Record<string, unknown>) => void run(() => api.patch(`/products/${product.id}`, change));
  const saveNumber = (product: Product, field: 'minStock' | 'gramsPerPiece', value: string) => {
    const number = parseQty(value) ?? null;
    if (Number.isNaN(number) || number === product[field]) return;
    patch(product, { [field]: number });
  };

  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">{t('stock.settings.title')}</summary>
      <p className="mt-2 text-sm text-muted">{t('stock.settings.help')}</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {products.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <div className="min-w-40 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              {p.aliases.length > 0 && <div className="truncate text-xs text-muted">{t('stock.aliases', { names: p.aliases.join(', ') })}</div>}
            </div>
            <label className="flex items-center gap-1" title={t('stock.stapleTitle')}>
              <input type="checkbox" className="size-4 accent-(--accent)" checked={p.isStaple} onChange={(e) => patch(p, { staple: e.target.checked })} />
              {t('stock.staple')}
            </label>
            <Input
              key={`min-${p.minStock}`}
              defaultValue={p.minStock ?? ''}
              placeholder="—"
              inputMode="decimal"
              aria-label={t('stock.minFor', { name: p.name })}
              onBlur={(e) => saveNumber(p, 'minStock', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="h-8 w-16 px-2 text-right"
            />
            <span className="w-8 text-muted">{p.defaultUnit === 'piece' ? '' : p.defaultUnit}</span>
            <Input
              key={`gpp-${p.gramsPerPiece}`}
              defaultValue={p.gramsPerPiece ?? ''}
              placeholder={t('stock.gramsPerPiece')}
              inputMode="decimal"
              aria-label={t('stock.gramsPerPieceAria', { name: p.name })}
              onBlur={(e) => saveNumber(p, 'gramsPerPiece', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="h-8 w-24 px-2 text-right"
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
