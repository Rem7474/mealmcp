import { useQuery } from '@tanstack/react-query';
import { ArrowsClockwise, Basket, Package, Plus, X } from '@phosphor-icons/react';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatMoney, formatQty, today } from '../format';
import { useT } from '../i18n';
import type { BudgetStatus, ShoppingItem } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { LocationSelect, parseQty, ProductDatalist, useCurrency } from './shared';

const sum = (items: ShoppingItem[]) => items.reduce((total, i) => total + (i.priceCents ?? i.estimatedCents ?? 0), 0);

/** One priced list: tick while shopping, enter what each line cost, then put the basket away in one go. */
export function Shopping() {
  const t = useT();
  const currency = useCurrency();
  const { data: items = [] } = useQuery({ queryKey: ['shopping'], queryFn: () => api.get<ShoppingItem[]>('/shopping') });
  const { data: budget } = useQuery({ queryKey: ['budget', 'status'], queryFn: () => api.get<BudgetStatus>('/budget/status') });
  const { run, pending } = useAction();
  const [form, setForm] = useState({ name: '', quantity: '', unit: '' });
  const [range, setRange] = useState({ from: today(), to: addDays(today(), 6) });
  const [complete, setComplete] = useState({ location: 'pantry', store: '', total: '' });

  const basket = items.filter((i) => i.checked);
  const open = items.filter((i) => !i.checked);
  const unpriced = open.filter((i) => i.priceCents === null && i.estimatedCents === null).length;
  const toBuy = sum(open);
  const inBasket = sum(basket);

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
      <ProductDatalist />
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="mr-auto">
            <h2 className="text-xl">{t('shopping.list.title')}</h2>
            <p className="text-sm text-muted">{t('shopping.list.toBuy', { n: open.length })}</p>
          </div>
          <span className="text-sm text-muted">{t('shopping.generate.from')}</span>
          <Input type="date" aria-label={t('shopping.generate.fromAria')} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="text-sm text-muted">{t('shopping.generate.to')}</span>
          <Input type="date" aria-label={t('shopping.generate.toAria')} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <Button variant="primary" disabled={pending} onClick={() => run(() => api.post('/shopping/generate', range))}>
            <ArrowsClockwise size={16} />
            {t('shopping.generate.button')}
          </Button>
        </div>
        <p className="max-w-2xl text-xs text-muted">{t('shopping.generate.help')}</p>

        <form onSubmit={add} className="flex flex-wrap gap-2">
          <Input required list="product-names" placeholder={t('shopping.list.item')} aria-label={t('shopping.list.item')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 basis-40" />
          <Input inputMode="decimal" placeholder={t('common.qty')} aria-label={t('common.quantity')} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-20" />
          <Input list="unit-names" placeholder={t('common.unit')} aria-label={t('common.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-24" />
          <Button type="submit" disabled={pending}>
            <Plus size={16} />
            {t('common.add')}
          </Button>
        </form>

        {items.length === 0 ? (
          <Empty>{t('shopping.list.empty')}</Empty>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="relative flex items-center gap-3 px-2 py-1 hover:bg-ink/5">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-[18px] accent-(--accent)"
                    checked={item.checked}
                    onChange={() => run(() => api.patch(`/shopping/${item.id}`, { checked: !item.checked }))}
                  />
                  <span className={`truncate ${item.checked ? 'text-muted line-through' : ''}`}>{item.name}</span>
                  <span className="text-sm whitespace-nowrap text-muted tabular-nums">{formatQty(item.quantity, item.unit)}</span>
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
                  className="h-8 w-24 px-2 text-right tabular-nums"
                />
                <Button variant="ghost" className="size-8 px-0" aria-label={t('stock.remove', { name: item.name })} onClick={() => run(() => api.del(`/shopping/${item.id}`))}>
                  <X size={14} />
                </Button>
                <span className="fade-rule absolute inset-x-0 bottom-0 opacity-50" />
              </li>
            ))}
          </ul>
        )}

        {basket.length > 0 && (
          <Card>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Basket size={20} className="text-accent" />
              <span>{t('shopping.complete.text', { n: basket.length })}</span>
              <LocationSelect value={complete.location} onChange={(e) => setComplete({ ...complete, location: e.target.value })} />
              <Input placeholder={t('shopping.complete.store')} aria-label={t('shopping.complete.store')} value={complete.store} onChange={(e) => setComplete({ ...complete, store: e.target.value })} className="w-40" />
              <span className="flex-1" />
              <Input inputMode="decimal" placeholder={t('shopping.complete.total')} aria-label={t('shopping.complete.total')} value={complete.total} onChange={(e) => setComplete({ ...complete, total: e.target.value })} className="w-44" />
              <Button variant="primary" disabled={pending} onClick={finish}>
                <Package size={16} />
                {t('shopping.complete.button')}
              </Button>
            </div>
          </Card>
        )}
      </div>

      <aside className="space-y-3 lg:pt-2">
        <Card>
          <h3 className="text-[11px] font-normal tracking-wider text-muted uppercase">{t('shopping.rail.toBuy')}</h3>
          <div className="mt-2 text-3xl tracking-tight tabular-nums">≈ {formatMoney(toBuy, currency)}</div>
          {unpriced > 0 && <p className="mt-1 text-xs text-muted">{t('shopping.unpriced', { n: unpriced })}</p>}
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t('shopping.rail.basket')}</dt>
              <dd className="tabular-nums">{formatMoney(inBasket, currency)}</dd>
            </div>
            {budget?.budgetCents ? (
              <div className="flex justify-between">
                <dt className="text-muted">{t('shopping.rail.after')}</dt>
                <dd className="tabular-nums">≈ {formatMoney(budget.budgetCents - budget.spentCents - toBuy - inBasket, currency)}</dd>
              </div>
            ) : null}
          </dl>
          {budget?.budgetCents ? (
            <div className="relative mt-3 flex h-1.5 overflow-hidden rounded-full bg-line">
              <div className="bg-accent" style={{ width: `${Math.min(100, (budget.spentCents / budget.budgetCents) * 100)}%` }} />
              <div className="bg-accent-700" style={{ width: `${Math.min(100, ((toBuy + inBasket) / budget.budgetCents) * 100)}%` }} />
            </div>
          ) : null}
        </Card>
      </aside>
    </div>
  );
}
