import { Package, Plus, Snowflake, Thermometer } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { daysUntil, formatDate, formatMoney, formatQty, LOCATIONS } from '../format';
import { useT } from '../i18n';
import type { Product, StockAlerts, StockItem, WasteSummary } from '../types';
import { Accordion, Badge, Button, Card, Empty, Fab, Field, Input, Select, Sheet } from '../ui';
import { ProductNutritionCard } from './Nutrition';
import { LocationSelect, PriceHistoryView, ProductDatalist, parseQty, UnitPrice, useCurrency, useProducts } from './shared';

const LOCATION_ICON = {
  fridge: <Thermometer size={16} className="text-accent" />,
  freezer: <Snowflake size={16} className="text-accent" />,
  pantry: <Package size={16} className="text-accent" />,
};

export function Stock() {
  const t = useT();
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api.get<StockItem[]>('/stock') });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<StockAlerts>('/stock/alerts') });
  const products = useProducts();
  const items = stock.data ?? [];

  return (
    <>
      <ProductDatalist />
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
      {alerts.data && alerts.data.opened.length > 0 && (
        <Card title={t('stock.opened.title')}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {alerts.data.opened.map((i) => {
              const days = i.expiresOn ? daysUntil(i.expiresOn) : null;
              return (
                <li key={i.id}>
                  <Badge tone={days !== null && days <= 1 ? 'warn' : 'accent'}>
                    {i.name}: {formatQty(i.quantity, i.unit)} {t('stock.opened.left')}
                    {i.expiresOn ? ` · ${formatDate(i.expiresOn)}` : ''}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <AddForm />
      <div className="grid items-start gap-x-4 gap-y-6 lg:grid-cols-3">
        {LOCATIONS.map((location) => {
          // What goes off first comes first; items without a date sink to the bottom.
          const here = items
            .filter((i) => i.location === location)
            .sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'));
          return (
            <section key={location}>
              <h2 className="mb-2 flex items-center gap-2 px-1 text-xl">
                {LOCATION_ICON[location]}
                {t(`location.${location}`)}
                <span className="font-sans text-sm text-muted tabular-nums">{here.length}</span>
              </h2>
              {here.length === 0 ? (
                // An empty place is one quiet line, not a card of its own. Nothing is said while the stock is still loading.
                <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-muted">
                  {stock.data ? t('stock.nothingHere') : ' '}
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-xl bg-surface px-3 shadow-[0_0_0_1px_var(--line)]">
                  {here.map((item) => (
                    <StockRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <WasteCard />
      <Thresholds products={products.data ?? []} />
      <ProductNutritionCard />
    </>
  );
}

function AddForm() {
  const t = useT();
  const { run, pending } = useAction();
  const [form, setForm] = useState({
    name: '',
    quantity: '1',
    unit: '',
    location: 'fridge',
    expiresOn: '',
    dateKind: '',
    note: '',
    approximate: false,
    packSize: '',
    opened: false,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const [open, setOpen] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const size = parseQty(form.packSize);
    const inPacks = !form.approximate && size !== undefined && !Number.isNaN(size);
    await run(() =>
      api.post('/stock', {
        name: form.name,
        // With a pack size, the quantity field is the number of packs: "3 x 200 ml".
        quantity: form.approximate || inPacks ? undefined : parseQty(form.quantity),
        ...(inPacks ? { packSize: size, packCount: form.opened ? 1 : parseQty(form.quantity) } : {}),
        opened: form.opened || undefined,
        approximate: form.approximate,
        unit: form.unit || undefined,
        location: form.location,
        expiresOn: form.expiresOn || null,
        ...(form.expiresOn && form.dateKind ? { dateKind: form.dateKind } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      }),
    );
    set({ name: '', quantity: '1', expiresOn: '', dateKind: '', note: '', packSize: '', opened: false });
    setOpen(false);
  };

  return (
    <>
      <div className="flex justify-end max-sm:hidden">
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={16} />
          {t('stock.add.title')}
        </Button>
      </div>
      <Fab label={t('stock.add.title')} onClick={() => setOpen(true)} />
      {open && (
        <Sheet title={t('stock.add.title')} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Field label={t('common.product')}>
              <Input
                required
                autoFocus
                list="product-names"
                placeholder={t('common.product')}
                aria-label={t('common.product')}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                className="w-full"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('common.quantity')}>
                <Input
                  required={!form.approximate}
                  disabled={form.approximate}
                  inputMode="decimal"
                  aria-label={t('common.quantity')}
                  value={form.approximate ? '' : form.quantity}
                  onChange={(e) => set({ quantity: e.target.value })}
                  className="w-full"
                />
              </Field>
              <Field label={t('common.unit')}>
                <Input
                  list="unit-names"
                  aria-label={t('common.unit')}
                  value={form.unit}
                  onChange={(e) => set({ unit: e.target.value })}
                  className="w-full"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('location.label')}>
                <LocationSelect value={form.location} onChange={(e) => set({ location: e.target.value })} className="w-full" />
              </Field>
              <Field label={t('stock.expiry')}>
                <Input
                  type="date"
                  aria-label={t('stock.expiry')}
                  value={form.expiresOn}
                  onChange={(e) => set({ expiresOn: e.target.value })}
                  className="w-full"
                />
              </Field>
            </div>
            {form.expiresOn && <DateKindSelect value={form.dateKind} onChange={(v) => set({ dateKind: v })} />}
            <Field label={t('stock.note')}>
              <Input
                aria-label={t('stock.note')}
                maxLength={200}
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label={t('stock.packSize')}>
              <Input
                inputMode="decimal"
                aria-label={t('stock.packSize')}
                value={form.packSize}
                onChange={(e) => set({ packSize: e.target.value })}
                className="w-full"
              />
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-line px-3 text-sm">
              {t('stock.approximate')}
              <input
                type="checkbox"
                className="size-5"
                checked={form.approximate}
                onChange={(e) => set({ approximate: e.target.checked })}
              />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-line px-3 text-sm">
              {t('stock.alreadyOpened')}
              <input type="checkbox" className="size-5" checked={form.opened} onChange={(e) => set({ opened: e.target.checked })} />
            </label>
            <Button type="submit" variant="primary" disabled={pending} className="h-12 w-full text-base sm:h-12">
              {t('common.add')}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}

function DateKindSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useT();
  return (
    <Field label={t('stock.dateKind')}>
      <Select aria-label={t('stock.dateKind')} value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
        <option value="">{t('stock.dateKind.unknown')}</option>
        <option value="use_by">{t('stock.dateKind.useBy')}</option>
        <option value="best_before">{t('stock.dateKind.bestBefore')}</option>
      </Select>
    </Field>
  );
}

function StockRow({ item }: { item: StockItem }) {
  const t = useT();
  const { run } = useAction();
  const days = item.expiresOn ? daysUntil(item.expiresOn) : null;
  const [editing, setEditing] = useState(false);

  const saveQuantity = (value: string) => {
    const quantity = parseQty(value);
    if (quantity === undefined || Number.isNaN(quantity) || quantity === item.quantity) return;
    void run(() => api.patch(`/stock/${item.id}`, { quantity }));
  };

  const actions: { key: string; label: string; aria: string; run: () => void }[] = [
    { key: 'edit', label: t('stock.edit'), aria: t('stock.editTitle', { name: item.name }), run: () => setEditing(true) },
  ];
  if (item.opened && (item.packSize === null || item.quantity >= item.packSize - 1e-9))
    actions.push({
      key: 'unopen',
      label: t('stock.unopen'),
      aria: t('stock.unopenAria', { name: item.name }),
      run: () => void run(() => api.post(`/stock/${item.id}/unopen`, {})),
    });
  if (!item.approximate && !item.opened)
    actions.push({
      key: 'open',
      label: t('stock.open'),
      aria: t('stock.openAria', { name: item.name }),
      run: () => void run(() => api.post(`/stock/${item.id}/open`, {})),
    });
  if (!item.approximate && !item.frozen)
    actions.push({
      key: 'freeze',
      label: t('stock.freeze'),
      aria: t('stock.freezeAria', { name: item.name }),
      run: () => {
        // A thawed line is only frozen again on purpose.
        if (item.thawed && !window.confirm(t('stock.refreezeConfirm'))) return;
        void run(() => api.post(`/stock/${item.id}/freeze`, item.thawed ? { refreeze: true } : {}));
      },
    });
  if (item.frozen || item.location === 'freezer')
    actions.push({
      key: 'thaw',
      label: t('stock.thaw'),
      aria: t('stock.thawAria', { name: item.name }),
      run: () => void run(() => api.post(`/stock/${item.id}/thaw`, {})),
    });
  actions.push({
    key: 'discard',
    label: t('stock.discard'),
    aria: t('stock.discardAria', { name: item.name }),
    run: () => void run(() => api.post(`/stock/${item.id}/discard`, { reason: days !== null && days < 0 ? 'expired' : 'spoiled' })),
  });
  actions.push({
    key: 'remove',
    label: t('stock.removeShort'),
    aria: t('stock.remove', { name: item.name }),
    run: () => void run(() => api.del(`/stock/${item.id}`)),
  });

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
      {/* min-w keeps the name readable in a narrow column: the controls wrap to the next line instead of squeezing it. */}
      <div className="flex min-w-32 flex-1 flex-wrap items-center gap-x-2">
        <div className="font-medium order-1 text-base wrap-break-word">
          {item.name}
          {item.brand && <span className="ml-1.5 text-xs font-normal text-muted">{item.brand}</span>}
        </div>
        {item.note && <div className="order-3 basis-full text-xs text-muted">{item.note}</div>}
        {item.paidPer ? (
          <span className="order-3 basis-full text-xs text-muted">
            <UnitPrice price={item.paidPer.main} /> {t('price.paid')}
          </span>
        ) : (
          item.pricePer && <UnitPrice price={item.pricePer.main} className="order-3 basis-full text-xs text-muted" />
        )}
        {item.opened && item.openedOn && (
          <div className="order-3 basis-full text-xs text-accent">{t('stock.openedBadge', { date: formatDate(item.openedOn) })}</div>
        )}
        {(item.frozenOn || item.thawedOn) && (
          <div className="order-3 basis-full text-xs text-accent">
            {item.frozenOn
              ? t('stock.frozenBadge', { date: formatDate(item.frozenOn) })
              : t('stock.thawedBadge', { date: formatDate(item.thawedOn as string) })}
          </div>
        )}
        {item.packCount !== null && item.packSize !== null && (
          <div className="order-3 basis-full text-xs text-muted">
            {item.packCount} × {formatQty(item.packSize, item.unit)}
          </div>
        )}
        {item.expiresOn && days !== null && (
          // The date is a chip that gets louder as it nears: calm, then amber, then red.
          <span
            title={t(days < 0 ? 'stock.expired' : item.dateKind === 'best_before' ? 'stock.bestBefore' : 'stock.useBy', {
              date: formatDate(item.expiresOn),
            })}
            className={`order-2 inline-block rounded-md px-1.5 py-0.5 text-xs ${
              item.expiryState === 'discard'
                ? 'bg-danger/15 text-danger'
                : item.expiryState === 'check' || item.expiryState === 'soon'
                  ? 'bg-warn/15 text-warn'
                  : 'bg-ink/5 text-muted'
            }`}
          >
            {item.expiryState === 'discard'
              ? t('stock.toDiscard')
              : item.expiryState === 'check'
                ? t('stock.toCheck')
                : days === 0
                  ? t('stock.today')
                  : t('stock.daysLeft', { n: days })}
          </span>
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
            className="h-9 w-16 rounded-b-none border-transparent border-b-control bg-transparent px-1 text-right text-base tabular-nums hover:border-b-muted focus:rounded-lg focus:bg-surface"
          />
          <span className="w-8 text-muted">{item.unit === 'piece' ? '' : item.unit}</span>
        </>
      )}
      {/* One "more" menu on every screen keeps each row to a single line. */}
      <details className="no-chev relative">
        <summary
          aria-label={t('common.more')}
          className="flex size-11 sm:size-9 cursor-pointer list-none items-center justify-center rounded-lg text-xl leading-none text-muted active:bg-ink/10 [&::-webkit-details-marker]:hidden"
        >
          ⋯
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-surface p-1">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-label={a.aria}
              className={`flex h-11 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm active:bg-ink/10 ${a.key === 'remove' ? 'text-danger' : ''}`}
              onClick={(e) => {
                e.currentTarget.closest('details')?.removeAttribute('open');
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </details>
      {editing && <EditStock item={item} onClose={() => setEditing(false)} />}
    </li>
  );
}

/** Where an item is kept, when it goes off and how many packs there are: what the list row does not let you change. */
export function EditStock({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const [location, setLocation] = useState<string>(item.location);
  const [expiresOn, setExpiresOn] = useState(item.expiresOn ?? '');
  const [openedOn, setOpenedOn] = useState(item.openedOn ?? '');
  const [dateKind, setDateKind] = useState<string>(item.dateKind ?? '');
  const [packs, setPacks] = useState(item.packCount === null ? '' : String(item.packCount));
  const product = useProducts().data?.find((p) => p.id === item.productId);
  const [shelfLife, setShelfLife] = useState<string | null>(null);
  const [note, setNote] = useState(item.note ?? '');
  const [brand, setBrand] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [frozenDays, setFrozenDays] = useState<string | null>(null);
  const [thawedDays, setThawedDays] = useState<string | null>(null);
  const [minStock, setMinStock] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const count = parseQty(packs);
    await run(() =>
      api.patch(`/stock/${item.id}`, {
        location,
        // The expiry is only sent when it was edited: otherwise a corrected opening date moves it by itself.
        ...(expiresOn !== (item.expiresOn ?? '') ? { expiresOn: expiresOn || null } : {}),
        ...(item.openedOn && openedOn && openedOn !== item.openedOn ? { openedOn } : {}),
        ...(dateKind !== (item.dateKind ?? '') ? { dateKind: dateKind || null } : {}),
        ...(note.trim() !== (item.note ?? '') ? { note: note.trim() || null } : {}),
        ...(item.packCount !== null && count !== undefined && !Number.isNaN(count) ? { packCount: count } : {}),
      }),
    );
    // What the product keeps for good (shelf life once opened, low-stock alert) applies to every line of it.
    const change: Record<string, unknown> = {};
    const days = shelfLife === null ? undefined : parseQty(shelfLife);
    if (shelfLife !== null && (days === undefined || (!Number.isNaN(days) && days !== product?.openedShelfLifeDays)))
      change.openedShelfLifeDays = days ?? null;
    for (const [key, typed, saved] of [
      ['frozenShelfLifeDays', frozenDays, product?.frozenShelfLifeDays],
      ['thawedShelfLifeDays', thawedDays, product?.thawedShelfLifeDays],
    ] as const) {
      const n = typed === null ? undefined : parseQty(typed);
      if (typed !== null && (n === undefined || (!Number.isNaN(n) && n !== saved))) change[key] = n ?? null;
    }
    if (brand !== null && brand.trim() !== (product?.brand ?? '')) change.brand = brand.trim() || null;
    if (barcode !== null && barcode.trim() !== (product?.barcode ?? '')) change.barcode = barcode.trim() || null;
    const min = minStock === null ? undefined : parseQty(minStock);
    if (minStock !== null && (min === undefined || (!Number.isNaN(min) && min !== product?.minStock))) change.minStock = min ?? null;
    if (Object.keys(change).length > 0) await run(() => api.patch(`/products/${item.productId}`, change));
    onClose();
  };

  return (
    <Sheet title={t('stock.editTitle', { name: item.name })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('location.label')}>
          <LocationSelect value={location} onChange={(e) => setLocation(e.target.value)} className="w-full" />
        </Field>
        <Field label={t('stock.expiry')}>
          <Input
            type="date"
            aria-label={t('stock.expiry')}
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="w-full"
          />
        </Field>
        {expiresOn && <DateKindSelect value={dateKind} onChange={setDateKind} />}
        <Field label={t('stock.note')}>
          <Input aria-label={t('stock.note')} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className="w-full" />
        </Field>
        {item.openedOn && (
          <Field
            label={t('stock.openedOnLabel')}
            hint={item.printedExpiresOn ? t('stock.printedHint', { date: formatDate(item.printedExpiresOn) }) : undefined}
          >
            <Input
              type="date"
              aria-label={t('stock.openedOnLabel')}
              max={new Date().toISOString().slice(0, 10)}
              value={openedOn}
              onChange={(e) => setOpenedOn(e.target.value)}
              className="w-full"
            />
          </Field>
        )}
        {item.packCount !== null && (
          <Field label={t('stock.packs')}>
            <Input
              inputMode="numeric"
              aria-label={t('stock.packs')}
              value={packs}
              onChange={(e) => setPacks(e.target.value)}
              className="w-full"
            />
          </Field>
        )}
        {product && (
          <fieldset className="space-y-3 rounded-xl border border-line p-3">
            <legend className="px-1 text-xs font-medium text-muted">{t('stock.editProduct', { name: item.name })}</legend>
            <Field label={t('stock.shelfLifeLabel')}>
              <Input
                inputMode="numeric"
                aria-label={t('stock.shelfLifeAria', { name: item.name })}
                value={shelfLife ?? product.openedShelfLifeDays ?? ''}
                onChange={(e) => setShelfLife(e.target.value)}
                className="w-full"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('stock.brand')}>
                <Input
                  aria-label={t('stock.brand')}
                  value={brand ?? product.brand ?? ''}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full"
                />
              </Field>
              <Field label={t('stock.barcode')}>
                <Input
                  inputMode="numeric"
                  aria-label={t('stock.barcode')}
                  value={barcode ?? product.barcode ?? ''}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="w-full"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('stock.frozenLifeLabel')}>
                <Input
                  inputMode="numeric"
                  aria-label={t('stock.frozenLifeAria', { name: item.name })}
                  value={frozenDays ?? product.frozenShelfLifeDays ?? ''}
                  onChange={(e) => setFrozenDays(e.target.value)}
                  className="w-full"
                />
              </Field>
              <Field label={t('stock.thawedLifeLabel')}>
                <Input
                  inputMode="numeric"
                  aria-label={t('stock.thawedLifeAria', { name: item.name })}
                  value={thawedDays ?? product.thawedShelfLifeDays ?? ''}
                  onChange={(e) => setThawedDays(e.target.value)}
                  className="w-full"
                />
              </Field>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted">{t('price.history')}</p>
              <PriceHistoryView productId={item.productId} />
            </div>
            <Field label={`${t('stock.minLabel')} (${item.unit === 'piece' ? '#' : item.unit})`}>
              <Input
                inputMode="decimal"
                aria-label={t('stock.minFor', { name: item.name })}
                value={minStock ?? product.minStock ?? ''}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full"
              />
            </Field>
          </fieldset>
        )}
        <Button type="submit" variant="primary" disabled={pending} className="h-12 w-full text-base sm:h-12">
          {t('common.save')}
        </Button>
      </form>
    </Sheet>
  );
}

/** What was thrown away lately, with its estimated value: the cost of not using things in time. */
function WasteCard() {
  const t = useT();
  const currency = useCurrency();
  const { data } = useQuery({ queryKey: ['waste'], queryFn: () => api.get<WasteSummary>('/waste') });
  if (!data) return null;
  return (
    <Card title={t('waste.title')}>
      <p className="mb-2 text-sm text-muted">{t('waste.help')}</p>
      {data.itemsThrownAway === 0 ? (
        <Empty>{t('waste.empty')}</Empty>
      ) : (
        <>
          <p className="text-sm font-medium">
            {t('waste.total', { n: data.itemsThrownAway, cost: formatMoney(data.totalCostCents, currency) })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {data.byProduct.slice(0, 8).map((p) => (
              <li key={p.name + p.unit}>
                <Badge tone="warn">
                  {p.name}: {formatQty(p.quantity, p.unit)}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Net (label) and drained weight of a canned product: recipes count drained grams, the label says net. */
function DrainedField({ product: p, patch }: { product: Product; patch: (p: Product, change: Record<string, unknown>) => void }) {
  const t = useT();
  const [net, setNet] = useState(p.drainedRatio ? '100' : '');
  const [drained, setDrained] = useState(p.drainedRatio ? String(Math.round(p.drainedRatio * 1000) / 10) : '');
  const save = () => {
    const n = parseQty(net);
    const d = parseQty(drained);
    if (n === undefined && d === undefined) {
      if (p.drainedRatio !== null) patch(p, { drained: null });
    } else if (n && d && !Number.isNaN(n) && !Number.isNaN(d) && d <= n && Math.abs(d / n - (p.drainedRatio ?? -1)) > 1e-6) {
      patch(p, { drained: { netGrams: n, drainedGrams: d } });
    }
  };
  return (
    <span className="flex items-center gap-1" role="group" aria-label={t('stock.drainedAria', { name: p.name })}>
      <Input
        value={net}
        onChange={(e) => setNet(e.target.value)}
        onBlur={save}
        placeholder={t('stock.drainedNet')}
        inputMode="decimal"
        className="h-8 w-20 px-2 text-right"
      />
      <Input
        value={drained}
        onChange={(e) => setDrained(e.target.value)}
        onBlur={save}
        placeholder={t('stock.drainedDrained')}
        inputMode="decimal"
        className="h-8 w-24 px-2 text-right"
      />
    </span>
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
    <Accordion summary={t('stock.settings.title')}>
      <p className="mt-2 text-sm text-muted">{t('stock.settings.help')}</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {products.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <div className="min-w-40 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              {p.aliases.length > 0 && (
                <div className="truncate text-xs text-muted">{t('stock.aliases', { names: p.aliases.join(', ') })}</div>
              )}
            </div>
            <label className="flex items-center gap-1" title={t('stock.stapleTitle')}>
              <input
                type="checkbox"
                className="size-4 accent-(--accent)"
                checked={p.isStaple}
                onChange={(e) => patch(p, { staple: e.target.checked })}
              />
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
            <Input
              key={`life-${p.openedShelfLifeDays}`}
              defaultValue={p.openedShelfLifeDays ?? ''}
              placeholder={t('stock.shelfLife')}
              inputMode="numeric"
              aria-label={t('stock.shelfLifeAria', { name: p.name })}
              onBlur={(e) => {
                const days = parseQty(e.target.value) ?? null;
                if (days === null ? p.openedShelfLifeDays !== null : !Number.isNaN(days) && days !== p.openedShelfLifeDays)
                  patch(p, { openedShelfLifeDays: days });
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="h-8 w-36 px-2 text-right"
            />
            <DrainedField product={p} patch={patch} />
          </li>
        ))}
      </ul>
    </Accordion>
  );
}
