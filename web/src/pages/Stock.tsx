import { Barcode, Minus, Package, Plus, Snowflake, Thermometer } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { daysUntil, formatDate, formatMoney, formatQty, LOCATIONS } from '../format';
import { locale, useT } from '../i18n';
import type { CatalogLookup, Product, StockAlerts, StockItem, WasteSummary } from '../types';
import { Accordion, Badge, Button, Card, Empty, Fab, Field, Input, Select, Sheet } from '../ui';
import { ProductNutritionCard } from './Nutrition';
import { ProductSheet } from './ProductSheet';
import { CameraScan, canScan, cleanCode, isCode } from './Scan';
import { StarterStockCard } from './Starter';
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
      {alerts.data?.toDiscard && alerts.data.toDiscard.length > 0 && (
        <Card title={t('stock.alerts.toDiscard')}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {alerts.data.toDiscard.map((i) => (
              <li key={i.id}>
                <Badge tone="warn">
                  {i.name}: {formatQty(i.quantity, i.unit)}
                  {i.expiresOn ? ` · ${formatDate(i.expiresOn)}` : ''}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {alerts.data?.expiring && alerts.data.expiring.length > 0 && (
        <Card title={t('stock.alerts.expiring')}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {alerts.data.expiring.map((i) => (
              <li key={i.id}>
                <Badge tone="warn">
                  {i.name}: {formatQty(i.quantity, i.unit)}
                  {i.expiresOn ? ` · ${formatDate(i.expiresOn)}` : ''}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {stock.isSuccess && items.length === 0 && <StarterStockCard />}
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
    openedOn: '',
    price: '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const [open, setOpen] = useState(false);
  const { data: products = [] } = useProducts();
  // The barcode: scanned or typed, looked up once, and what came back (names to choose from, brand, a note).
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(false);
  const [looking, setLooking] = useState(false);
  const [scan, setScan] = useState<{
    code: string;
    note: 'known' | 'found' | 'unknown' | 'offline';
    name?: string;
    brand?: string;
    names: string[];
  } | null>(null);

  /** Fills the form from a code: a code seen before gives its product and size, else the catalogue's entry. */
  const lookup = async (raw: string) => {
    const next = cleanCode(raw);
    setCode(next);
    if (!isCode(next) || scan?.code === next) return;
    setLooking(true);
    try {
      const found = await api.get<CatalogLookup>(`/catalog/products/${next}?lang=${locale().slice(0, 2)}`);
      const size = found.known ? { size: found.known.packSize, unit: found.known.unit } : found.hit?.packSize;
      const names = [
        ...new Set([...found.suggestions.map((p) => p.name), found.hit?.name, found.hit?.genericName].filter((n): n is string => !!n)),
      ];
      const name = found.known?.productName ?? names[0];
      setForm((f) => ({
        ...f,
        ...(name ? { name } : {}),
        quantity: '1',
        ...(size?.size && size.unit ? { packSize: String(size.size), unit: size.unit } : {}),
      }));
      setScan({
        code: next,
        note: found.known ? 'known' : found.hit ? 'found' : 'unknown',
        name: found.known?.productName ?? found.hit?.name,
        brand: found.hit?.brand ?? undefined,
        names: found.known ? [] : names,
      });
    } catch {
      // The catalogue is out of reach: the form stays as typed, and the code is still sent with the stock line.
      setScan({ code: next, note: 'offline', names: [] });
    } finally {
      setLooking(false);
    }
  };

  const sizeNow = parseQty(form.packSize);
  const hasPacks = !form.approximate && sizeNow !== undefined && !Number.isNaN(sizeNow);
  const packs = parseQty(form.quantity) ?? 1;
  const step = (by: number) => set({ quantity: String(Math.max(1, Math.round(packs) + by)) });
  // The sizes already known for this product, one per barcode, as shortcuts.
  const formats = (products.find((p) => p.name.toLowerCase() === form.name.trim().toLowerCase())?.barcodes ?? []).filter(
    (b) => b.packSize && b.unit,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const size = parseQty(form.packSize);
    const price = parseQty(form.price);
    const inPacks = !form.approximate && size !== undefined && !Number.isNaN(size);
    await run(() =>
      api.post('/stock', {
        name: form.name,
        // With a pack size, the quantity field is the number of packs: "3 x 200 ml".
        quantity: form.approximate || inPacks ? undefined : parseQty(form.quantity),
        ...(inPacks ? { packSize: size, packCount: form.opened ? 1 : parseQty(form.quantity) } : {}),
        ...(isCode(code) ? { barcode: code } : {}),
        opened: form.opened || undefined,
        ...(form.opened && form.openedOn ? { openedOn: form.openedOn } : {}),
        ...(price !== undefined && !Number.isNaN(price) && price >= 0 ? { price } : {}),
        approximate: form.approximate,
        unit: form.unit || undefined,
        location: form.location,
        expiresOn: form.expiresOn || null,
        ...(form.expiresOn && form.dateKind ? { dateKind: form.dateKind } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      }),
    );
    set({ name: '', quantity: '1', expiresOn: '', dateKind: '', note: '', packSize: '', opened: false, openedOn: '', price: '' });
    setCode('');
    setScan(null);
    setCamera(false);
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
            <div className="min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted">{t('stock.barcode')}</span>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={t('stock.barcode')}
                  value={code}
                  onChange={(e) => setCode(cleanCode(e.target.value))}
                  onBlur={(e) => void lookup(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || !isCode(code)) return;
                    e.preventDefault();
                    void lookup(code);
                  }}
                  className="w-full"
                />
                {canScan() && (
                  <Button aria-label={t('stock.scan.start')} title={t('stock.scan.start')} onClick={() => setCamera((c) => !c)}>
                    <Barcode size={18} />
                  </Button>
                )}
              </div>
            </div>
            {camera && (
              <CameraScan
                onCode={(c) => {
                  setCamera(false);
                  void lookup(c);
                }}
                onClose={() => setCamera(false)}
              />
            )}
            {looking && <p className="text-sm text-muted">{t('stock.scan.looking')}</p>}
            {scan && !looking && (
              <div role="status" className="space-y-1.5 text-sm text-muted">
                <p>
                  {scan.note === 'known' && t('stock.scan.known', { name: scan.name ?? '' })}
                  {scan.note === 'found' && t('stock.scan.found', { name: scan.name ?? '' })}
                  {scan.note === 'unknown' && t('stock.scan.unknown')}
                  {scan.note === 'offline' && t('stock.scan.offline')}
                  {scan.brand ? ` ${t('stock.scan.brand', { brand: scan.brand })}` : ''}
                </p>
                {scan.names.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{t('stock.scan.nameAs')}</span>
                    {scan.names.map((n) => (
                      <Button key={n} compact variant={form.name === n ? 'active' : 'secondary'} onClick={() => set({ name: n })}>
                        {n}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              <div className="min-w-0">
                <span className="mb-1 block text-xs font-medium text-muted">{t('common.quantity')}</span>
                <div className="flex gap-1.5">
                  {hasPacks && (
                    <Button aria-label={t('stock.packs.less')} onClick={() => step(-1)} disabled={packs <= 1}>
                      <Minus size={14} />
                    </Button>
                  )}
                  <Input
                    required={!form.approximate}
                    disabled={form.approximate}
                    inputMode="decimal"
                    aria-label={t('common.quantity')}
                    value={form.approximate ? '' : form.quantity}
                    onChange={(e) => set({ quantity: e.target.value })}
                    className="w-full min-w-0"
                  />
                  {hasPacks && (
                    <Button aria-label={t('stock.packs.more')} onClick={() => step(1)}>
                      <Plus size={14} />
                    </Button>
                  )}
                </div>
              </div>
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
            {formats.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <span>{t('stock.formats')}</span>
                {formats.map((b) => (
                  <Button
                    key={b.code}
                    compact
                    variant={String(b.packSize) === form.packSize && b.unit === form.unit ? 'active' : 'secondary'}
                    onClick={() => {
                      setCode(b.code);
                      setScan(null);
                      set({ packSize: String(b.packSize), unit: b.unit ?? '' });
                    }}
                  >
                    {formatQty(b.packSize, b.unit ?? '')}
                  </Button>
                ))}
              </div>
            )}
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
            {form.opened && (
              <Field label={t('stock.openedOn')}>
                <Input
                  type="date"
                  aria-label={t('stock.openedOn')}
                  value={form.openedOn}
                  onChange={(e) => set({ openedOn: e.target.value })}
                  className="w-full"
                />
              </Field>
            )}
            <Field label={t('stock.price')}>
              <Input
                inputMode="decimal"
                aria-label={t('stock.price')}
                placeholder="0.00"
                value={form.price}
                onChange={(e) => set({ price: e.target.value })}
                className="w-full"
              />
            </Field>
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
  const [freezingPart, setFreezingPart] = useState(false);
  const [opening, setOpening] = useState(false);
  const [discarding, setDiscarding] = useState(false);

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
      run: () => setOpening(true),
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
  if (!item.approximate && !item.frozen && !item.thawed && item.quantity > 0)
    actions.push({
      key: 'freezePart',
      label: t('stock.freezePart'),
      aria: t('stock.freezePartAria', { name: item.name }),
      run: () => setFreezingPart(true),
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
    run: () => setDiscarding(true),
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
      {freezingPart && <FreezePart item={item} onClose={() => setFreezingPart(false)} />}
      {opening && <OpenPack item={item} onClose={() => setOpening(false)} />}
      {discarding && (
        <DiscardLine item={item} defaultReason={days !== null && days < 0 ? 'expired' : 'spoiled'} onClose={() => setDiscarding(false)} />
      )}
    </li>
  );
}

function OpenPack({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const full = item.packSize ?? item.quantity;
  const [remaining, setRemaining] = useState(String(full));
  const qty = parseQty(remaining);
  const valid = qty !== undefined && !Number.isNaN(qty) && qty > 0 && qty <= full + 1e-9;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    await run(() => api.post(`/stock/${item.id}/open`, qty < full - 1e-9 ? { remaining: qty } : {}));
    onClose();
  };
  return (
    <Sheet title={t('stock.openTitle', { name: item.name })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('stock.openRemaining', { unit: item.unit })}>
          <Input autoFocus inputMode="decimal" value={remaining} onChange={(e) => setRemaining(e.target.value)} className="w-full" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="submit" variant="primary" disabled={!valid || pending}>
            {t('stock.open')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function DiscardLine({ item, defaultReason, onClose }: { item: StockItem; defaultReason: 'expired' | 'spoiled'; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const [amount, setAmount] = useState(item.approximate ? '' : String(item.quantity));
  const [reason, setReason] = useState<'expired' | 'spoiled' | 'leftover' | 'other'>(defaultReason);
  const qty = parseQty(amount);
  const valid = item.approximate || (qty !== undefined && !Number.isNaN(qty) && qty > 0 && qty <= item.quantity + 1e-9);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const partial = !item.approximate && qty !== undefined && qty < item.quantity - 1e-9;
    await run(() => api.post(`/stock/${item.id}/discard`, { ...(partial ? { quantity: qty } : {}), reason }));
    onClose();
  };
  return (
    <Sheet title={t('stock.discardTitle', { name: item.name })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {!item.approximate && (
          <Field label={t('stock.discardQuantity', { unit: item.unit })}>
            <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full" />
          </Field>
        )}
        <Field label={t('stock.discardReason')}>
          <Select
            aria-label={t('stock.discardReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="w-full"
          >
            <option value="expired">{t('stock.discardReason.expired')}</option>
            <option value="spoiled">{t('stock.discardReason.spoiled')}</option>
            <option value="leftover">{t('stock.discardReason.leftover')}</option>
            <option value="other">{t('stock.discardReason.other')}</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="submit" variant="primary" disabled={!valid || pending}>
            {t('stock.discard')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/** Freezes a part of a line (a part of the pack bought): the line is split, only that part gets the freezing date. */
export function FreezePart({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const [amount, setAmount] = useState('');
  const quantity = parseQty(amount);
  const valid = quantity !== undefined && !Number.isNaN(quantity) && quantity > 0;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    await run(() => api.post(`/stock/${item.id}/freeze`, { quantity }));
    onClose();
  };
  return (
    <Sheet title={t('stock.freezePartTitle', { name: item.name })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">{t('stock.freezePartHelp', { total: formatQty(item.quantity, item.unit) })}</p>
        <Field label={t('stock.freezePartQuantity', { unit: item.unit })}>
          <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="submit" variant="primary" disabled={!valid || pending}>
            {t('stock.freeze')}
          </Button>
        </div>
      </form>
    </Sheet>
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

/**
 * Per-product settings: search any product and open its unified sheet (thresholds, staple, shelf life, conversions,
 * drained weight, brand, barcodes, aliases and price).
 */
function Thresholds({ products }: { products: Product[] }) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  if (products.length === 0) return null;

  const q = search.trim().toLowerCase();
  const matches = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q)));
  const edited = editing !== null ? (products.find((p) => p.id === editing) ?? null) : null;

  return (
    <Accordion summary={t('stock.settings.title')}>
      {edited && <ProductSheet key={edited.id} product={edited} onClose={() => setEditing(null)} />}
      <p className="mt-2 text-sm text-muted">{t('stock.settings.help')}</p>
      <Input
        type="search"
        placeholder={t('products.search')}
        aria-label={t('products.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mt-3 w-full"
      />
      {matches.length === 0 ? (
        <Empty>{t('products.none')}</Empty>
      ) : (
        <ul className="mt-3 max-h-96 divide-y divide-line overflow-y-auto text-sm">
          {matches.slice(0, 100).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.isStaple && <Badge>{t('products.staple')}</Badge>}
                  {p.minStock !== null && (
                    <Badge tone="muted">
                      {t('products.minStock')}: {formatQty(p.minStock, p.defaultUnit)}
                    </Badge>
                  )}
                </div>
                {p.aliases.length > 0 && (
                  <div className="truncate text-xs text-muted">{t('stock.aliases', { names: p.aliases.join(', ') })}</div>
                )}
              </div>
              <Button compact onClick={() => setEditing(p.id)}>
                {t('stock.edit')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Accordion>
  );
}
