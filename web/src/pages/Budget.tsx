import { Plus } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import {
  addDays,
  CURRENCIES,
  currencyLabel,
  currencySymbol,
  formatDate,
  formatMoney,
  formatMonth,
  formatQty,
  monthStart,
  today,
} from '../format';
import { type MessageKey, useT } from '../i18n';
import type { BudgetStatus, Expense, ExpenseSummary, Product, SpendingSummary, User } from '../types';
import { Accordion, Button, Card, Empty, Fab, Field, Input, Select, Sheet } from '../ui';
import { ProductSheet } from './ProductSheet';
import { AISLES, ProductDatalist, parseQty, TrendMark, usePriceOverview, useProducts } from './shared';

export function Budget({ user }: { user: User }) {
  return (
    // Phones read it top to bottom (month, where it went, then the records); wide screens keep two columns.
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
      <div className="contents lg:block lg:space-y-4">
        <div className="order-1">
          <MonthCard currency={user.currency} />
        </div>
        <div className="order-3">
          <AddExpense />
        </div>
        <div className="order-4">
          <ExpensesCard currency={user.currency} />
        </div>
      </div>
      <div className="contents lg:block lg:space-y-4">
        <div className="order-2">
          <SummaryCard currency={user.currency} />
        </div>
        <div className="order-5">
          <PricesCard currency={user.currency} />
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars, one per row, sized relative to the largest. */
function Bars({ rows, currency }: { rows: { label: string; cents: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.cents));
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums">{formatMoney(r.cents, currency)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-line" aria-hidden>
            <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(2, (r.cents / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl tracking-tight tabular-nums ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</div>
    </div>
  );
}

function MonthCard({ currency }: { currency: string }) {
  const t = useT();
  const { run, pending } = useAction();
  const { data: status } = useQuery({ queryKey: ['budget', 'status'], queryFn: () => api.get<BudgetStatus>('/budget/status') });
  if (!status) return null;

  const over = status.budgetCents !== null && status.spentCents > status.budgetCents;
  const pct = status.budgetCents ? Math.min(100, (status.spentCents / status.budgetCents) * 100) : 0;

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const monthly = parseQty(String(data.get('monthly') ?? ''));
    const code = String(data.get('currency') ?? '')
      .trim()
      .toUpperCase();
    void run(() =>
      api.put('/budget', {
        monthly: monthly === undefined || Number.isNaN(monthly) ? null : monthly,
        currency: /^[A-Z]{3}$/.test(code) ? code : undefined,
      }),
    );
  };

  return (
    <Card title={t('budget.month.title', { month: formatMonth(status.month) })}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t('budget.spent')} value={formatMoney(status.spentCents, currency)} />
        {status.budgetCents !== null && (
          <Stat
            label={over ? t('budget.overBy') : t('budget.remaining')}
            value={formatMoney(Math.abs(status.remainingCents ?? 0), currency)}
            tone={over ? 'danger' : undefined}
          />
        )}
        <Stat
          label={t('budget.projected')}
          value={formatMoney(status.projectedCents, currency)}
          tone={status.budgetCents !== null && status.projectedCents > status.budgetCents ? 'danger' : undefined}
        />
      </div>
      {status.budgetCents !== null ? (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
            aria-label={t('budget.progress', {
              spent: formatMoney(status.spentCents, currency),
              budget: formatMoney(status.budgetCents, currency),
            })}
            className="h-2 rounded-full bg-line"
          >
            <div className={`h-2 rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {t('budget.progress', { spent: formatMoney(status.spentCents, currency), budget: formatMoney(status.budgetCents, currency) })}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{t('budget.noBudget')}</p>
      )}
      <details className="mt-4 border-t border-line pt-3" open={status.budgetCents === null}>
        <summary className="cursor-pointer text-sm text-muted">{t('budget.edit')}</summary>
        <form onSubmit={save} className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            key={`${status.budgetCents}-${currency}`}
            name="monthly"
            inputMode="decimal"
            defaultValue={status.budgetCents !== null ? status.budgetCents / 100 : ''}
            placeholder={t('budget.set.label')}
            aria-label={t('budget.set.label')}
            className="w-36"
          />
          <Select
            key={currency}
            name="currency"
            defaultValue={currency}
            aria-label={t('budget.set.currency')}
            className="max-w-full min-w-0"
          >
            {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
              <option key={c} value={c}>
                {currencyLabel(c)}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending}>
            {t('budget.set.save')}
          </Button>
          {status.budgetCents !== null && (
            <Button variant="ghost" disabled={pending} onClick={() => run(() => api.put('/budget', { monthly: null }))}>
              {t('budget.set.clear')}
            </Button>
          )}
        </form>
      </details>
    </Card>
  );
}

function SummaryCard({ currency }: { currency: string }) {
  const t = useT();
  const now = today();
  const presets = {
    month: { from: monthStart(now), to: now },
    last30: { from: addDays(now, -29), to: now },
    year: { from: `${now.slice(0, 4)}-01-01`, to: now },
  };
  const [preset, setPreset] = useState<keyof typeof presets>('month');
  const { from, to } = presets[preset];
  const { data } = useQuery({
    queryKey: ['budget', 'summary', from, to],
    queryFn: () => api.get<SpendingSummary>(`/budget/summary?from=${from}&to=${to}`),
  });

  return (
    <Card
      title={t('budget.summary.title')}
      actions={
        <div className="flex flex-wrap gap-1">
          {(Object.keys(presets) as (keyof typeof presets)[]).map((key) => (
            <Button key={key} variant={key === preset ? 'active' : 'secondary'} compact onClick={() => setPreset(key)}>
              {t(`budget.range.${key}`)}
            </Button>
          ))}
        </div>
      }
    >
      {!data ? null : data.expenseCount === 0 ? (
        <Empty>{t('budget.noData')}</Empty>
      ) : (
        <div className="space-y-4">
          <p className="font-semibold">
            {t('budget.summary.total', { total: formatMoney(data.totalCents, currency), n: data.expenseCount })}
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted">{t('budget.byCategory')}</h3>
              <Bars
                currency={currency}
                rows={[
                  ...data.byCategory.map((c) => ({
                    label:
                      c.category === null
                        ? t('budget.uncategorised')
                        : AISLES.includes(c.category)
                          ? t(`aisle.${c.category}` as MessageKey)
                          : c.category,
                    cents: c.totalCents,
                  })),
                  ...(data.notItemisedCents > 0 ? [{ label: t('budget.notItemised'), cents: data.notItemisedCents }] : []),
                ]}
              />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted">{t('budget.byStore')}</h3>
              <Bars currency={currency} rows={data.byStore.map((s) => ({ label: s.store ?? t('budget.noStore'), cents: s.totalCents }))} />
            </section>
            {data.byMonth.length > 1 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-muted">{t('budget.byMonth')}</h3>
                <Bars currency={currency} rows={data.byMonth.map((m) => ({ label: formatMonth(m.month), cents: m.totalCents }))} />
              </section>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function AddExpense() {
  const t = useT();
  const { run, pending } = useAction();
  const [form, setForm] = useState({ date: today(), store: '', total: '', note: '' });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const [open, setOpen] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(() =>
      api.post('/expenses', {
        date: form.date,
        store: form.store.trim() || undefined,
        total: parseQty(form.total),
        note: form.note.trim() || undefined,
      }),
    );
    set({ store: '', total: '', note: '' });
    setOpen(false);
  };

  return (
    <>
      <Button variant="primary" className="max-sm:hidden" onClick={() => setOpen(true)}>
        <Plus size={16} />
        {t('budget.add.title')}
      </Button>
      <Fab label={t('budget.add.title')} onClick={() => setOpen(true)} />
      {open && (
        <Sheet title={t('budget.add.title')} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Field label={t('budget.add.total')}>
              <Input
                required
                autoFocus
                inputMode="decimal"
                aria-label={t('budget.add.total')}
                value={form.total}
                onChange={(e) => set({ total: e.target.value })}
                className="w-full text-xl"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('budget.add.date')}>
                <Input
                  type="date"
                  required
                  aria-label={t('budget.add.date')}
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value })}
                  className="w-full"
                />
              </Field>
              <Field label={t('budget.add.store')}>
                <Input
                  aria-label={t('budget.add.store')}
                  value={form.store}
                  onChange={(e) => set({ store: e.target.value })}
                  className="w-full"
                />
              </Field>
            </div>
            <Field label={t('budget.add.note')}>
              <Input
                aria-label={t('budget.add.note')}
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
                className="w-full"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={pending} className="h-12 w-full text-base sm:h-12">
              {t('budget.add.submit')}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}

function ExpensesCard({ currency }: { currency: string }) {
  const t = useT();
  const { data = [] } = useQuery({ queryKey: ['budget', 'expenses'], queryFn: () => api.get<ExpenseSummary[]>('/expenses') });
  const [all, setAll] = useState(false);
  const shown = all ? data.slice(0, 50) : data.slice(0, 5);

  return (
    <Card title={t('budget.expenses.title')}>
      {data.length === 0 ? (
        <Empty>{t('budget.expenses.empty')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {shown.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} currency={currency} />
          ))}
        </ul>
      )}
      {data.length > 5 && (
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setAll(!all)}>
          {all ? t('budget.expenses.less') : t('budget.expenses.all', { n: Math.min(data.length, 50) })}
        </Button>
      )}
    </Card>
  );
}

function ExpenseRow({ expense, currency }: { expense: ExpenseSummary; currency: string }) {
  const t = useT();
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const { data: detail } = useQuery({
    queryKey: ['budget', 'expense', expense.id],
    queryFn: () => api.get<Expense>(`/expenses/${expense.id}`),
    enabled: open,
  });

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <div className="font-medium">
            {expense.store ?? t('budget.noStore')} <span className="font-normal text-muted">· {formatDate(expense.date)}</span>
          </div>
          <div className="truncate text-muted">
            {[expense.itemCount > 0 ? t('budget.expenses.lines', { n: expense.itemCount }) : null, expense.note]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </button>
        <span className="font-semibold tabular-nums">{formatMoney(expense.totalCents, currency)}</span>
        <Button
          variant="ghost"
          compact
          aria-label={t('budget.expenses.delete')}
          onClick={() => confirm(t('budget.expenses.confirmDelete')) && run(() => api.del(`/expenses/${expense.id}`))}
        >
          ✕
        </Button>
      </div>
      {open && detail && detail.items.length > 0 && (
        <ul className="mt-2 space-y-0.5 pl-3 text-muted">
          {detail.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>
                {item.name}
                {item.quantity !== null && item.unit ? ` · ${formatQty(item.quantity, item.unit)}` : ''}
              </span>
              <span className="tabular-nums">{formatMoney(item.priceCents, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Price of 1 kg / 1 l / 1 piece, the units people think in. */
const displayUnit = (unit: string) =>
  unit === 'g' ? { unit: 'kg', factor: 1000 } : unit === 'ml' ? { unit: 'l', factor: 1000 } : { unit, factor: 1 };

function PricesCard({ currency }: { currency: string }) {
  const t = useT();
  const { run, pending } = useAction();
  const { data: products = [] } = useProducts();
  const overview = usePriceOverview();
  const [editing, setEditing] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState({ name: '', price: '', quantity: '1', unit: '' });
  const priced = products.filter(
    (p): p is Product & { unitPrice: number; priceUnit: string } => p.unitPrice !== null && p.priceUnit !== null,
  );
  const edited = editing !== null ? (products.find((p) => p.id === editing) ?? null) : null;

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
      <form onSubmit={addPrice} className="mt-3 flex flex-wrap items-end gap-2">
        <Field label={t('budget.prices.product')} className="min-w-36 flex-1">
          <Input
            required
            list="product-names"
            placeholder={t('products.search')}
            value={newPrice.name}
            onChange={(e) => setNewPrice({ ...newPrice, name: e.target.value })}
            className="w-full"
          />
        </Field>
        <Field label={`${t('products.price')} (${currencySymbol(currency)})`}>
          <Input
            required
            inputMode="decimal"
            placeholder="0.00"
            value={newPrice.price}
            onChange={(e) => setNewPrice({ ...newPrice, price: e.target.value })}
            className="w-24"
          />
        </Field>
        <Field label={t('common.qty')}>
          <Input
            inputMode="decimal"
            value={newPrice.quantity}
            onChange={(e) => setNewPrice({ ...newPrice, quantity: e.target.value })}
            className="w-20"
          />
        </Field>
        <Field label={t('common.unit')}>
          <Input
            list="unit-names"
            placeholder={t('common.unit')}
            value={newPrice.unit}
            onChange={(e) => setNewPrice({ ...newPrice, unit: e.target.value })}
            className="w-20"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {t('budget.prices.add')}
        </Button>
      </form>
      {priced.length === 0 ? (
        <Empty>{t('budget.prices.empty')}</Empty>
      ) : (
        <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {priced.map((p) => {
            const shown = displayUnit(p.priceUnit);
            return (
              <li key={p.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(p.id)}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-accent hover:underline"
                >
                  {p.name}
                </button>
                <TrendMark trend={overview.get(p.id)?.trend} />
                <Input
                  key={p.unitPrice}
                  defaultValue={((p.unitPrice * shown.factor) / 100).toFixed(2)}
                  inputMode="decimal"
                  aria-label={t('budget.prices.aria', { name: p.name, unit: shown.unit })}
                  onBlur={(e) => save(p, shown, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="h-8 w-20 px-2 text-right"
                />
                <span className="w-16 text-muted">
                  {currencySymbol(currency)}/{shown.unit === 'piece' ? '1' : shown.unit}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Accordion>
  );
}
