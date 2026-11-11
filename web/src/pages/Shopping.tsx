import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatQty, today } from '../format';
import type { ShoppingItem } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { LocationSelect, parseQty, ProductDatalist } from './shared';

export function Shopping() {
  const { data: items = [] } = useQuery({ queryKey: ['shopping'], queryFn: () => api.get<ShoppingItem[]>('/shopping') });
  const { run, pending } = useAction();
  const [form, setForm] = useState({ name: '', quantity: '', unit: '' });
  const [range, setRange] = useState({ from: today(), to: addDays(today(), 6) });
  const [location, setLocation] = useState('pantry');
  const checkedCount = items.filter((i) => i.checked).length;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    await run(() => api.post('/shopping', { name: form.name, quantity: parseQty(form.quantity) ?? null, unit: form.unit || undefined }));
    setForm({ name: '', quantity: '', unit: '' });
  };

  return (
    <>
      <ProductDatalist />
      <Card title="Générer depuis le planning">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Repas du</span>
          <Input type="date" aria-label="Du" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="text-muted">au</span>
          <Input type="date" aria-label="Au" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <Button variant="primary" disabled={pending} onClick={() => run(() => api.post('/shopping/generate', range))}>
            Générer
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Ajoute ce qui manque pour les recettes planifiées, moins le stock, plus les produits sous leur seuil. Vos ajouts manuels sont conservés.
        </p>
      </Card>

      <Card title="Liste de courses" actions={<span className="text-sm text-muted">{items.length - checkedCount} à acheter</span>}>
        <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
          <Input required list="product-names" placeholder="Article" aria-label="Article" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 basis-40" />
          <Input inputMode="decimal" placeholder="Qté" aria-label="Quantité" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-20" />
          <Input list="unit-names" placeholder="Unité" aria-label="Unité" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-24" />
          <Button type="submit" variant="primary" disabled={pending}>
            Ajouter
          </Button>
        </form>

        {items.length === 0 ? (
          <Empty>La liste est vide.</Empty>
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
                {item.source === 'plan' && <Badge tone="accent">planning</Badge>}
                <Button variant="ghost" className="h-8 px-2" aria-label={`Retirer ${item.name}`} onClick={() => run(() => api.del(`/shopping/${item.id}`))}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}

        {checkedCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
            <span>
              Ranger {checkedCount} article{checkedCount > 1 ? 's' : ''} coché{checkedCount > 1 ? 's' : ''} dans
            </span>
            <LocationSelect value={location} onChange={(e) => setLocation(e.target.value)} />
            <Button variant="primary" disabled={pending} onClick={() => run(() => api.post('/shopping/complete', { location }))}>
              Mettre en stock
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
