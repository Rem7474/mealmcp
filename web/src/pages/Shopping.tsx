import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatMoney, formatQty, today } from '../format';
import { useT } from '../i18n';
import type { ShoppingEstimate, ShoppingItem } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { LocationSelect, parseQty, ProductDatalist, useCurrency } from './shared';

export function Shopping() {
  const t = useT();
  const currency = useCurrency();
  const { data: items = [] } = useQuery({ queryKey: ['shopping'], queryFn: () => api.get<ShoppingItem[]>('/shopping') });
  const { data: estimate } = useQuery({ queryKey: ['shopping', 'estimate'], queryFn: () => api.get<ShoppingEstimate>('/shopping/estimate') });
  const { run, pending } = useAction();
  const [form, setForm] = useState({ name: '', quantity: '', unit: '' });
  const [range, setRange] = useState({ from: today(), to: addDays(today(), 6) });
  const [complete, setComplete] = useState({ location: 'pantry', store: '', total: '' });
  const checkedCount = items.filter((i) => i.checked).length;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    await run(() => api.post('/shopping', { name: form.name, quantity: parseQty(form.quantity) ?? null, unit: form.unit || undefined }));
    setForm({ name: '', quantity: '', unit: '' });
  };

  const savePrice = (item: ShoppingItem, value: string) => {
    const price = value.trim() === '' ? null : parseQty(value);
    if (price !== null && (price === undefined || Number.isNaN(price))) return;
    const current = item.priceCents === null ? null : item.priceCents / 100;
    if (price === current) return;
    void run(() => api.patch(`/shopping/${item.id}`, { price }));
  };

  const finish = () =>
    run(() =>
      api.post('/shopping/complete', {
        location: complete.location,
        store: complete.store.trim() || undefined,
        total: parseQty(complete.total),
      }),
    ).then(() => setComplete({ ...complete, store: '', total: '' }));

  return (
    <>
      <ProductDatalist />
      <Card title={t('shopping.generate.title')}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{t('shopping.generate.from')}</span>
          <Input type="date" aria-label={t('shopping.generate.fromAria')} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="text-muted">{t('shopping.generate.to')}</span>
          <Input type="date" aria-label={t('shopping.generate.toAria')} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <Button variant="primary" disabled={pending} onClick={() => run(() => api.post('/shopping/generate', range))}>
            {t('shopping.generate.button')}
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted">{t('shopping.generate.help')}</p>
      </Card>

      <Card title={t('shopping.list.title')} actions={<span className="text-sm text-muted">{t('shopping.list.toBuy', { n: items.length - checkedCount })}</span>}>
        <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
          <Input required list="product-names" placeholder={t('shopping.list.item')} aria-label={t('shopping.list.item')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 basis-40" />
          <Input inputMode="decimal" placeholder={t('common.qty')} aria-label={t('common.quantity')} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-20" />
          <Input list="unit-names" placeholder={t('common.unit')} aria-label={t('common.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-24" />
          <Button type="submit" variant="primary" disabled={pending}>
            {t('common.add')}
          </Button>
        </form>

        {estimate && estimate.pricedItems > 0 && (
          <p className="mb-2 text-sm text-muted">
            {t('shopping.estimate', { total: formatMoney(estimate.totalCents, currency) })}
            {estimate.unpricedItems > 0 && ` ${t('shopping.unpriced', { n: estimate.unpricedItems })}`}
          </p>
        )}

        {items.length === 0 ? (
          <Empty>{t('shopping.list.empty')}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-1">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5 accent-(--accent)"
                    checked={item.checked}
                    onChange={() => run(() => api.patch(`/shopping/${item.id}`, { checked: !item.checked }))}
                  />
                  <span className={`truncate ${item.checked ? 'text-muted line-through' : ''}`}>{item.name}</span>
                  <span className="text-sm text-muted">{formatQty(item.quantity, item.unit)}</span>
                </label>
                {item.source === 'plan' && <Badge tone="accent">{t('shopping.list.fromPlan')}</Badge>}
                <Input
                  key={`${item.priceCents}-${item.estimatedCents}`}
                  defaultValue={item.priceCents !== null ? item.priceCents / 100 : ''}
                  placeholder={item.estimatedCents !== null ? `≈ ${(item.estimatedCents / 100).toFixed(2)}` : currency}
                  inputMode="decimal"
                  aria-label={t('shopping.price', { name: item.name })}
                  onBlur={(e) => savePrice(item, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="h-8 w-24 px-2 text-right"
                />
                <Button variant="ghost" className="h-8 px-2" aria-label={t('stock.remove', { name: item.name })} onClick={() => run(() => api.del(`/shopping/${item.id}`))}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}

        {checkedCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
            <span>{t('shopping.complete.text', { n: checkedCount })}</span>
            <LocationSelect value={complete.location} onChange={(e) => setComplete({ ...complete, location: e.target.value })} />
            <Input placeholder={t('shopping.complete.store')} aria-label={t('shopping.complete.store')} value={complete.store} onChange={(e) => setComplete({ ...complete, store: e.target.value })} className="w-40" />
            <Input inputMode="decimal" placeholder={t('shopping.complete.total')} aria-label={t('shopping.complete.total')} value={complete.total} onChange={(e) => setComplete({ ...complete, total: e.target.value })} className="w-44" />
            <Button variant="primary" disabled={pending} onClick={finish}>
              {t('shopping.complete.button')}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
