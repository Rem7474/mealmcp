import { useQuery } from '@tanstack/react-query';
import { Package, Snowflake, Thermometer } from '@phosphor-icons/react';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { daysUntil, formatDate, formatMoney, formatQty, LOCATIONS } from '../format';
import { useT } from '../i18n';
import type { Product, StockAlerts, StockItem, WasteSummary } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { ProductNutritionCard } from './Nutrition';
import { LocationSelect, parseQty, ProductDatalist, useCurrency, useProducts } from './shared';

const LOCATION_ICON = { fridge: <Thermometer size={16} className="text-accent" />, freezer: <Snowflake size={16} className="text-accent" />, pantry: <Package size={16} className="text-accent" /> };

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
      <div className="grid gap-4 md:grid-cols-3">
        {LOCATIONS.map((location) => {
          const here = items.filter((i) => i.location === location);
          return (
            <Card key={location} title={<span className="inline-flex items-center gap-2">{LOCATION_ICON[location]}{t(`location.${location}`)}</span>} actions={<span className="text-sm text-muted">{here.length}</span>}>
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
      <WasteCard />
      <Thresholds products={products.data ?? []} />
      <ProductNutritionCard />
    </>
  );
}

function AddForm() {
  const t = useT();
  const { run, pending } = useAction();
  const [form, setForm] = useState({ name: '', quantity: '1', unit: '', location: 'fridge', expiresOn: '', approximate: false, packSize: '', opened: false });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

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
      }),
    );
    set({ name: '', quantity: '1', expiresOn: '', packSize: '', opened: false });
  };

  return (
    <Card title={t('stock.add.title')}>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input required list="product-names" placeholder={t('common.product')} aria-label={t('common.product')} value={form.name} onChange={(e) => set({ name: e.target.value })} className="flex-1 basis-40" />
        <Input required={!form.approximate} disabled={form.approximate} inputMode="decimal" placeholder={t('common.qty')} aria-label={t('common.quantity')} value={form.approximate ? '' : form.quantity} onChange={(e) => set({ quantity: e.target.value })} className="w-20" />
        <Input inputMode="decimal" placeholder={t('stock.packSize')} aria-label={t('stock.packSize')} value={form.packSize} onChange={(e) => set({ packSize: e.target.value })} className="w-40" />
        <Input list="unit-names" placeholder={t('common.unit')} aria-label={t('common.unit')} value={form.unit} onChange={(e) => set({ unit: e.target.value })} className="w-24" />
        <LocationSelect value={form.location} onChange={(e) => set({ location: e.target.value })} />
        <Input type="date" aria-label={t('stock.expiry')} value={form.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-(--accent)" checked={form.approximate} onChange={(e) => set({ approximate: e.target.checked })} />
          {t('stock.approximate')}
        </label>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-(--accent)" checked={form.opened} onChange={(e) => set({ opened: e.target.checked })} />
          {t('stock.alreadyOpened')}
        </label>
        <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
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
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
      <div className="min-w-40 flex-1">
        <div className="font-medium wrap-break-word">{item.name}</div>
        {item.opened && item.openedOn && <div className="text-xs text-accent">{t('stock.openedBadge', { date: formatDate(item.openedOn) })}</div>}
        {item.packCount !== null && item.packSize !== null && (
          <div className="text-xs text-muted">
            {item.packCount} × {formatQty(item.packSize, item.unit)}
          </div>
        )}
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
      {item.opened && (item.packSize === null || item.quantity >= item.packSize - 1e-9) && (
        <Button variant="ghost" className="h-8 px-2 text-xs" aria-label={t('stock.unopenAria', { name: item.name })} onClick={() => run(() => api.post('/stock/' + item.id + '/unopen', {}))}>
          {t('stock.unopen')}
        </Button>
      )}
      {!item.approximate && !item.opened && (
        <Button variant="ghost" className="h-8 px-2 text-xs" aria-label={t('stock.openAria', { name: item.name })} onClick={() => run(() => api.post(`/stock/${item.id}/open`, {}))}>
          {t('stock.open')}
        </Button>
      )}
      <Button variant="ghost" className="h-8 px-2 text-xs" aria-label={t('stock.discardAria', { name: item.name })} onClick={() => run(() => api.post(`/stock/${item.id}/discard`, { reason: days !== null && days < 0 ? 'expired' : 'spoiled' }))}>
        {t('stock.discard')}
      </Button>
      <Button variant="ghost" className="h-8 px-2" aria-label={t('stock.remove', { name: item.name })} onClick={() => run(() => api.del(`/stock/${item.id}`))}>
        ✕
      </Button>
    </li>
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
          <p className="text-sm font-medium">{t('waste.total', { n: data.itemsThrownAway, cost: formatMoney(data.totalCostCents, currency) })}</p>
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
      <Input value={net} onChange={(e) => setNet(e.target.value)} onBlur={save} placeholder={t('stock.drainedNet')} inputMode="decimal" className="h-8 w-20 px-2 text-right" />
      <Input value={drained} onChange={(e) => setDrained(e.target.value)} onBlur={save} placeholder={t('stock.drainedDrained')} inputMode="decimal" className="h-8 w-24 px-2 text-right" />
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
            <Input
              key={`life-${p.openedShelfLifeDays}`}
              defaultValue={p.openedShelfLifeDays ?? ''}
              placeholder={t('stock.shelfLife')}
              inputMode="numeric"
              aria-label={t('stock.shelfLifeAria', { name: p.name })}
              onBlur={(e) => {
                const days = parseQty(e.target.value) ?? null;
                if (days === null ? p.openedShelfLifeDays !== null : !Number.isNaN(days) && days !== p.openedShelfLifeDays) patch(p, { openedShelfLifeDays: days });
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="h-8 w-36 px-2 text-right"
            />
            <DrainedField product={p} patch={patch} />
          </li>
        ))}
      </ul>
    </details>
  );
}
