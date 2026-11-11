import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { daysUntil, formatDate, formatQty, LOCATION_LABELS } from '../format';
import type { Location, Product, StockAlerts, StockItem } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { LocationSelect, parseQty, ProductDatalist, useProducts } from './shared';

export function Stock() {
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api.get<StockItem[]>('/stock') });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<StockAlerts>('/stock/alerts') });
  const products = useProducts();
  const items = stock.data ?? [];

  return (
    <>
      <ProductDatalist />
      <AddForm />
      {alerts.data && alerts.data.lowStock.length > 0 && (
        <Card title="Stock bas">
          <ul className="flex flex-wrap gap-2 text-sm">
            {alerts.data.lowStock.map((p) => (
              <li key={p.productId}>
                <Badge tone="warn">
                  {p.name} : {formatQty(p.current, p.unit) || '0'} / {formatQty(p.minStock, p.unit)}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(LOCATION_LABELS) as Location[]).map((location) => {
          const here = items.filter((i) => i.location === location);
          return (
            <Card key={location} title={LOCATION_LABELS[location]} actions={<span className="text-sm text-muted">{here.length}</span>}>
              {here.length === 0 ? (
                <Empty>Rien ici.</Empty>
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
  const { run, pending } = useAction();
  const [form, setForm] = useState({ name: '', quantity: '1', unit: '', location: 'fridge', expiresOn: '' });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(() =>
      api.post('/stock', {
        name: form.name,
        quantity: parseQty(form.quantity),
        unit: form.unit || undefined,
        location: form.location,
        expiresOn: form.expiresOn || null,
      }),
    );
    set({ name: '', quantity: '1', expiresOn: '' });
  };

  return (
    <Card title="Ajouter au stock">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input required list="product-names" placeholder="Produit" aria-label="Produit" value={form.name} onChange={(e) => set({ name: e.target.value })} className="flex-1 basis-40" />
        <Input required inputMode="decimal" placeholder="Qté" aria-label="Quantité" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} className="w-20" />
        <Input list="unit-names" placeholder="Unité" aria-label="Unité" value={form.unit} onChange={(e) => set({ unit: e.target.value })} className="w-24" />
        <LocationSelect value={form.location} onChange={(e) => set({ location: e.target.value })} />
        <Input type="date" aria-label="Date de péremption" value={form.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
        <Button type="submit" variant="primary" disabled={pending}>
          Ajouter
        </Button>
      </form>
    </Card>
  );
}

function StockRow({ item }: { item: StockItem }) {
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
            {days < 0 ? 'Périmé le ' : 'Jusqu’au '}
            {formatDate(item.expiresOn)}
          </div>
        )}
      </div>
      <Input
        key={item.quantity}
        defaultValue={item.quantity}
        inputMode="decimal"
        aria-label={`Quantité de ${item.name}`}
        onBlur={(e) => saveQuantity(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-8 w-16 px-2 text-right"
      />
      <span className="w-10 text-muted">{item.unit === 'pièce' ? '' : item.unit}</span>
      <Button variant="ghost" className="h-8 px-2" aria-label={`Retirer ${item.name}`} onClick={() => run(() => api.del(`/stock/${item.id}`))}>
        ✕
      </Button>
    </li>
  );
}

/** Minimum quantity per product; below it, the product shows up in "Stock bas" and in generated shopping lists. */
function Thresholds({ products }: { products: Product[] }) {
  const { run } = useAction();
  if (products.length === 0) return null;

  const save = (product: Product, value: string) => {
    const minStock = parseQty(value) ?? null;
    if (Number.isNaN(minStock) || minStock === product.minStock) return;
    void run(() => api.patch(`/products/${product.id}`, { minStock }));
  };

  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">Seuils d’alerte par produit</summary>
      <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <Input
              key={p.minStock}
              defaultValue={p.minStock ?? ''}
              placeholder="—"
              inputMode="decimal"
              aria-label={`Seuil minimum pour ${p.name}`}
              onBlur={(e) => save(p, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="h-8 w-16 px-2 text-right"
            />
            <span className="w-10 text-muted">{p.defaultUnit === 'pièce' ? '' : p.defaultUnit}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
