import { CheckCircle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, useAction } from '../api';
import { LOCATIONS } from '../format';
import { useT } from '../i18n';
import { shrinkImage } from '../receiptImage';
import type { AiStatus, Location } from '../types';
import { Badge, Button, Field, Input, Select, Sheet } from '../ui';
import { parseQty } from './shared';

interface ParsedPurchaseLine {
  text: string;
  name: string;
  quantity: number;
  unit: string;
  price: number | null;
  match: 'barcode' | 'name' | 'close' | 'new' | 'unknown';
  onList: boolean;
  include: boolean;
}

interface Read {
  lines: ParsedPurchaseLine[];
  total?: number | null;
  store?: string | null;
}

interface Draft {
  name: string;
  quantity: string;
  unit: string;
  price: string;
  include: boolean;
  match: ParsedPurchaseLine['match'];
  onList: boolean;
}

const MATCH_LABEL = {
  barcode: 'purchase.match.known',
  name: 'purchase.match.known',
  close: 'purchase.match.close',
  new: 'purchase.match.new',
  unknown: 'purchase.match.unknown',
} as const;

/**
 * "I did my shopping": type or paste what was bought, check the lines the app understood (matched to known products,
 * or new ones), then put it all away at once: stock, shopping list and expense. Nothing is saved before the last button.
 */
export function PurchaseFromText({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [meta, setMeta] = useState<{ location: Location; store: string; total: string; date: string }>({
    location: 'pantry',
    store: '',
    total: '',
    date: '',
  });
  const [done, setDone] = useState<{ added: number; removed: number } | null>(null);

  // Offered only when the household's AI server answers and has a model.
  const { data: ai } = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api.get<AiStatus>('/ai/status'), retry: false });

  const read = async (withAi = false) =>
    show((await run(() => api.post<Read>(withAi ? '/shopping/from-text/ai' : '/shopping/from-text', { text }))) as Read);
  const readFile = async (file: File) =>
    show((await run(async () => api.upload<Read>('/shopping/receipt', await shrinkImage(file)))) as Read);
  const show = ({ lines, total, store }: Read) => {
    if (total != null || store) setMeta((m) => ({ ...m, ...(total != null ? { total: String(total) } : {}), ...(store ? { store } : {}) }));
    setDrafts(
      lines.map((l) => ({
        name: l.name,
        quantity: String(l.quantity),
        unit: l.unit === 'piece' ? '' : l.unit,
        price: l.price === null ? '' : String(l.price),
        include: l.include,
        match: l.match,
        onList: l.onList,
      })),
    );
  };

  // A decimal comma ("1,5") is what a French keypad types: Number("1,5") would be NaN and drop the line silently.
  const num = (value: string) => parseQty(value) ?? Number.NaN;
  const kept = (drafts ?? []).filter((d) => d.include && d.name.trim() && num(d.quantity) > 0);
  const edit = (i: number, patch: Partial<Draft>) => setDrafts((all) => all?.map((d, j) => (j === i ? { ...d, ...patch } : d)) ?? null);

  const apply = async () => {
    const result = (await run(() =>
      api.post('/shopping/from-text/apply', {
        lines: kept.map((d) => ({
          name: d.name.trim(),
          quantity: num(d.quantity),
          ...(d.unit.trim() ? { unit: d.unit.trim() } : {}),
          ...(num(d.price) >= 0 ? { price: num(d.price) } : {}),
        })),
        location: meta.location,
        ...(meta.store.trim() ? { store: meta.store.trim() } : {}),
        ...(meta.date ? { date: meta.date } : {}),
        ...(num(meta.total) >= 0 ? { total: num(meta.total) } : {}),
      }),
    )) as { addedToStock: number; removedFromList: number };
    setDone({ added: result.addedToStock, removed: result.removedFromList });
  };

  return (
    <Sheet title={t('purchase.title')} onClose={onClose}>
      {done ? (
        <div className="space-y-3 p-5 text-sm">
          <p className="flex items-center gap-2 text-base">
            <CheckCircle size={20} className="text-accent" />
            {t('purchase.done', { n: done.added })}
          </p>
          {done.removed > 0 && <p className="text-muted">{t('purchase.removed', { n: done.removed })}</p>}
          <Button onClick={onClose}>{t('app.close')}</Button>
        </div>
      ) : !drafts ? (
        <div className="space-y-3 overflow-y-auto p-5">
          <p className="text-sm text-muted">{t('purchase.intro')}</p>
          <Field label={t('purchase.text')}>
            <textarea
              className="min-h-36 w-full rounded-xl border-2 border-transparent bg-surface-high p-3 text-base text-ink placeholder:text-muted focus:border-accent focus:bg-surface"
              placeholder={t('purchase.placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={5000}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending || !text.trim()} onClick={() => read(false)}>
              {t('purchase.read')}
            </Button>
            {ai?.text && (
              <Button disabled={pending || !text.trim()} onClick={() => read(true)}>
                {t('purchase.readAi')}
              </Button>
            )}
          </div>
          {ai?.text && <p className="text-xs text-muted">{t('purchase.aiHint')}</p>}
          {ai?.text && (
            <Field label={t('purchase.receipt')} hint={t('purchase.receiptHint')}>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={pending}
                className="block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  // A refused file is already reported in the app banner by useAction.
                  if (file) readFile(file).catch(() => {});
                }}
              />
            </Field>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3 overflow-y-auto p-5">
            {drafts.length === 0 && <p className="text-sm text-muted">{t('purchase.empty')}</p>}
            <ul className="space-y-3">
              {drafts.map((d, i) => (
                <li key={i} className={`rounded-2xl bg-surface-high/60 p-3.5 text-sm ${d.include ? '' : 'opacity-60'}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <label className="flex min-h-11 items-center gap-1.5 sm:min-h-0">
                      <input type="checkbox" checked={d.include} onChange={(e) => edit(i, { include: e.target.checked })} />
                      <span className="sr-only">{t('purchase.keep', { name: d.name || '?' })}</span>
                    </label>
                    <Badge tone={d.match === 'new' || d.match === 'unknown' ? 'warn' : 'accent'}>{t(MATCH_LABEL[d.match])}</Badge>
                    {d.onList && <Badge>{t('purchase.onList')}</Badge>}
                  </div>
                  <div className="grid grid-cols-[1fr_5rem_5rem_5.5rem] gap-2 max-sm:grid-cols-2">
                    <Input
                      aria-label={t('purchase.name', { n: i + 1 })}
                      value={d.name}
                      onChange={(e) => edit(i, { name: e.target.value })}
                      className="max-sm:col-span-2"
                    />
                    <Input
                      aria-label={t('purchase.quantity', { n: i + 1 })}
                      inputMode="decimal"
                      value={d.quantity}
                      onChange={(e) => edit(i, { quantity: e.target.value })}
                    />
                    <Input
                      aria-label={t('purchase.unit', { n: i + 1 })}
                      value={d.unit}
                      onChange={(e) => edit(i, { unit: e.target.value })}
                    />
                    <Input
                      aria-label={t('purchase.price', { n: i + 1 })}
                      inputMode="decimal"
                      value={d.price}
                      onChange={(e) => edit(i, { price: e.target.value })}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label={t('purchase.where')}>
                <Select value={meta.location} onChange={(e) => setMeta({ ...meta, location: e.target.value as Location })}>
                  {LOCATIONS.map((l) => (
                    <option key={l} value={l}>
                      {t(`location.${l}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('shopping.complete.store')}>
                <Input value={meta.store} onChange={(e) => setMeta({ ...meta, store: e.target.value })} />
              </Field>
              <Field label={t('budget.add.date')}>
                <Input
                  type="date"
                  aria-label={t('budget.add.date')}
                  value={meta.date}
                  onChange={(e) => setMeta({ ...meta, date: e.target.value })}
                />
              </Field>
              <Field label={t('shopping.complete.total')}>
                <Input inputMode="decimal" value={meta.total} onChange={(e) => setMeta({ ...meta, total: e.target.value })} />
              </Field>
            </div>
          </div>
          <footer className="flex flex-wrap items-center gap-2 border-t-2 border-line px-5 py-3">
            <Button onClick={() => setDrafts(null)}>{t('purchase.back')}</Button>
            <Button variant="primary" disabled={pending || kept.length === 0} onClick={apply}>
              {t('purchase.apply', { n: kept.length })}
            </Button>
          </footer>
        </>
      )}
    </Sheet>
  );
}
