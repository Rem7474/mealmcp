import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatQty, today } from '../format';
import { useT } from '../i18n';
import type { ShoppingItem } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { LocationSelect, parseQty, ProductDatalist } from './shared';

export function Shopping() {
  const t = useT();
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
            <LocationSelect value={location} onChange={(e) => setLocation(e.target.value)} />
            <Button variant="primary" disabled={pending} onClick={() => run(() => api.post('/shopping/complete', { location }))}>
              {t('shopping.complete.button')}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
