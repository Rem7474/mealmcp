import { useQuery } from '@tanstack/react-query';
import { ArrowsClockwise, Basket, Package, Plus, X } from '@phosphor-icons/react';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, currencySymbol, formatDay, formatMoney, formatQty, MEALS, today } from '../format';
import { type MessageKey, useI18n, useT } from '../i18n';
import type { BudgetStatus, HouseholdSettings, ShoppingItem } from '../types';
import { Badge, Button, Card, Empty, Input, Select, Disclose } from '../ui';
import { LocationSelect, parseQty, ProductDatalist, useCurrency } from './shared';

const AISLES = ['produce', 'dairy', 'meat_fish', 'bakery', 'pantry', 'frozen', 'drinks', 'household', 'other'];
type GroupBy = NonNullable<HouseholdSettings['shoppingGroupBy']>;
type Group = { key: string; title: string | null; items: ShoppingItem[] };

const sum = (items: ShoppingItem[]) => items.reduce((total, i) => total + (i.priceCents ?? i.estimatedCents ?? 0), 0);

/** One priced list: tick while shopping, enter what each line cost, then put the basket away in one go. */
export function Shopping() {
  const t = useT();
  const { lang } = useI18n();
  const mealOrder = (m: ShoppingItem['meals'][number]) => `${m.date}-${MEALS.indexOf(m.mealType)}`;
  /** Splits the list into sections: by store aisle, or by the first planned meal that needs each item. */
  const group = (list: ShoppingItem[], by: GroupBy): Group[] => {
    if (by === 'none') return [{ key: 'all', title: null, items: list }];
    const buckets = new Map<string, Group>();
    const put = (key: string, title: string, item: ShoppingItem) => (buckets.get(key) ?? buckets.set(key, { key, title, items: [] }).get(key)!).items.push(item);
    for (const item of list) {
      if (by === 'aisle') {
        const c = item.category;
        put(c ?? '~', c ? (AISLES.includes(c) ? t(`aisle.${c}` as MessageKey) : c) : t('aisle.none'), item);
      } else {
        const m = item.meals[0];
        if (m) put(`a-${mealOrder(m)}-${m.id}`, `${formatDay(m.date)} · ${t(`meal.${m.mealType}`)} · ${m.title}`, item);
        else put('~', item.source === 'plan' ? t('shopping.group.noMeal') : t('shopping.group.other'), item);
      }
    }
    const rank = (g: Group) => (by === 'aisle' ? (AISLES.indexOf(g.key) >= 0 ? AISLES.indexOf(g.key) : g.key === '~' ? 99 : 50) : 0);
    return [...buckets.values()].sort((a, b) => rank(a) - rank(b) || (a.key === '~' ? 1 : b.key === '~' ? -1 : a.key.localeCompare(b.key)));
  };
  const currency = useCurrency();
  const { data: items = [] } = useQuery({ queryKey: ['shopping'], queryFn: () => api.get<ShoppingItem[]>('/shopping') });
  const { data: budget } = useQuery({ queryKey: ['budget', 'status'], queryFn: () => api.get<BudgetStatus>('/budget/status') });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<HouseholdSettings>('/settings') });
  const groupBy: GroupBy = settings?.shoppingGroupBy ?? 'none';
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
        <div className="flex items-end gap-2">
          <div className="mr-auto">
            <h2 className="text-xl">{t('shopping.list.title')}</h2>
            <p className="text-sm text-muted">{t('shopping.list.toBuy', { n: open.length })}</p>
          </div>
          <Button variant="primary" disabled={pending} onClick={() => run(() => api.post('/shopping/generate', range))}>
            <ArrowsClockwise size={16} />
            {t('shopping.generate.button')}
          </Button>
        </div>

        <Disclose summary={t('shopping.options')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t('shopping.generate.from')}</span>
            <Input type="date" aria-label={t('shopping.generate.fromAria')} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <span className="text-sm text-muted">{t('shopping.generate.to')}</span>
            <Input type="date" aria-label={t('shopping.generate.toAria')} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <p className="mt-2 max-w-2xl text-xs text-muted">{t('shopping.generate.help')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={t('shopping.group')}>
            <span className="text-muted">{t('shopping.group')}</span>
            {(['none', 'aisle', 'meal'] as const).map((mode) => (
              <Button key={mode} variant={groupBy === mode ? 'primary' : 'secondary'} className="h-8 px-3" aria-pressed={groupBy === mode} onClick={() => run(() => api.put('/settings', { shoppingGroupBy: mode }))}>
                {t(`shopping.group.${mode}`)}
              </Button>
            ))}
          </div>
        </Disclose>

        <Disclose summary={t('shopping.addItem')}>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input required list="product-names" placeholder={t('shopping.list.item')} aria-label={t('shopping.list.item')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 basis-40" />
            <Input inputMode="decimal" placeholder={t('common.qty')} aria-label={t('common.quantity')} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-20" />
            <Input list="unit-names" placeholder={t('common.unit')} aria-label={t('common.unit')} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-24" />
            <Button type="submit" disabled={pending}>
              <Plus size={16} />
              {t('common.add')}
            </Button>
          </form>
        </Disclose>

        {items.length === 0 ? (
          <Empty>{t('shopping.list.empty')}</Empty>
        ) : (
          <div className="space-y-5">
            {group(items, groupBy).map((g) => (
              <section key={g.key}>
                {g.title && (
                  <h3 className="mb-1 flex items-center gap-2 px-2 text-[11px] font-normal tracking-wider text-muted uppercase">
                    {g.title}
                    <span className="tabular-nums">{g.items.length}</span>
                  </h3>
                )}
                <ul>
                  {g.items.map((item) => (
                    <li key={item.id} className="relative flex items-center gap-x-2 px-2 py-1 hover:bg-ink/5 sm:gap-x-3">
                <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-[18px] shrink-0 accent-(--accent)"
                    checked={item.checked}
                    onChange={() => run(() => api.patch(`/shopping/${item.id}`, { checked: !item.checked }))}
                  />
                  <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
                    <span className={`wrap-break-word ${item.checked ? 'text-muted line-through' : ''}`}>{item.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm whitespace-nowrap text-muted tabular-nums">{formatQty(item.quantity, item.unit)}</span>
                      {item.season === 'out' && !item.checked && (
                        <span className="sm:hidden" title={item.seasonAlternatives.length ? t('season.instead', { list: item.seasonAlternatives.map((p) => p[lang]).join(', ') }) : undefined}>
                          <Badge tone="warn">{t('season.out')}</Badge>
                        </span>
                      )}
                    </span>
                  </span>
                </label>
                {groupBy === 'meal' && item.meals.length > 1 && (
                  <span className="hidden text-xs text-muted sm:inline">{t('shopping.alsoFor', { meals: item.meals.slice(1).map((m) => m.title).join(', ') })}</span>
                )}
                {groupBy === 'aisle' && (
                  <Select
                    aria-label={t('products.aisle')}
                    value={item.category ?? ''}
                    onChange={(e) => run(() => api.patch(`/products/${item.productId}`, { category: e.target.value || null }))}
                    className="hidden h-8 w-36 px-2 text-xs sm:block"
                  >
                    <option value="">{t('aisle.none')}</option>
                    {AISLES.map((c) => (
                      <option key={c} value={c}>
                        {t(`aisle.${c}` as MessageKey)}
                      </option>
                    ))}
                    {item.category && !AISLES.includes(item.category) && <option value={item.category}>{item.category}</option>}
                  </Select>
                )}
                {item.source === 'plan' && groupBy !== 'meal' && (
                  <span className="hidden sm:inline">
                    <Badge tone="accent">{t('shopping.list.fromPlan')}</Badge>
                  </span>
                )}
                {item.season === 'out' && !item.checked && (
                  <span className="hidden sm:inline" title={item.seasonAlternatives.length ? t('season.instead', { list: item.seasonAlternatives.map((p) => p[lang]).join(', ') }) : undefined}>
                    <Badge tone="warn">{t('season.out')}</Badge>
                  </span>
                )}
                <Input
                  key={`${item.priceCents}-${item.estimatedCents}`}
                  defaultValue={item.priceCents !== null ? item.priceCents / 100 : ''}
                  placeholder={item.estimatedCents !== null ? `≈ ${formatMoney(item.estimatedCents, currency)}` : currencySymbol(currency)}
                  inputMode="decimal"
                  aria-label={t('shopping.price', { name: item.name })}
                  onBlur={(e) => savePrice(item, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="h-8 w-[5.75rem] shrink-0 border-transparent bg-transparent px-1 text-right text-sm text-muted tabular-nums placeholder:text-muted/60 focus:w-20 focus:border-line focus:bg-surface focus:text-ink sm:w-24 sm:border-line sm:bg-surface sm:px-2 sm:text-base sm:text-ink sm:focus:w-24"
                />
                <Button variant="ghost" className="size-8 shrink-0 px-0" aria-label={t('stock.remove', { name: item.name })} onClick={() => run(() => api.del(`/shopping/${item.id}`))}>
                  <X size={14} />
                </Button>
                <span className="fade-rule absolute inset-x-0 bottom-0 opacity-50" />
              </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
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
