import { useQuery } from '@tanstack/react-query';
import type { SelectHTMLAttributes } from 'react';
import { api } from '../api';
import { formatDate, formatMoney, LOCATIONS } from '../format';
import { useT } from '../i18n';
import type { PriceHistory, PriceOverview, PricePer, Product } from '../types';
import { Select } from '../ui';
import { fetchMe, meKey } from './AuthPage';

export const AISLES: readonly string[] = ['produce', 'dairy', 'meat_fish', 'bakery', 'pantry', 'frozen', 'drinks', 'household', 'other'];

export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });

/** Autocomplete source for product-name inputs: use with `list="product-names"`. */
export function ProductDatalist() {
  const t = useT();
  const { data = [] } = useProducts();
  return (
    <>
      <datalist id="product-names">
        {data.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <datalist id="unit-names">
        {t('units.suggestions')
          .split(',')
          .map((u) => (
            <option key={u} value={u} />
          ))}
      </datalist>
    </>
  );
}

export function LocationSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const t = useT();
  return (
    <Select aria-label={t('location.label')} {...props}>
      {LOCATIONS.map((value) => (
        <option key={value} value={value}>
          {t(`location.${value}`)}
        </option>
      ))}
    </Select>
  );
}

/** "" -> undefined, otherwise a number (accepts a decimal comma). */
export const parseQty = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : undefined);

/** Currency of the signed-in household (ISO 4217 code). */
export function useCurrency(): string {
  const { data } = useQuery({ queryKey: meKey, queryFn: fetchMe });
  return data?.user?.currency ?? 'EUR';
}

/** "2,00 € / kg": a price per kg, litre or piece. */
export function UnitPrice({ price, className }: { price: PricePer | null | undefined; className?: string }) {
  const t = useT();
  const currency = useCurrency();
  if (!price) return null;
  return (
    <span className={className}>{t('price.per', { price: formatMoney(price.cents, currency), unit: t(`price.unit.${price.per}`) })}</span>
  );
}

const TREND_TONE = { up: 'text-danger', down: 'text-herb', stable: 'text-muted' } as const;
const TREND_MARK = { up: '↑', down: '↓', stable: '→' } as const;

/** Price trend per product (latest against earlier ones), keyed by product id. Empty until it has loaded. */
export function usePriceOverview(): Map<number, PriceOverview> {
  const { data } = useQuery({ queryKey: ['prices'], queryFn: () => api.get<PriceOverview[]>('/prices') });
  return new Map((data ?? []).map((p) => [p.productId, p]));
}

/** A small arrow for a price going up, down or staying put; the word is there for screen readers. */
export function TrendMark({ trend }: { trend: 'up' | 'down' | 'stable' | null | undefined }) {
  const t = useT();
  if (!trend) return null;
  return (
    <span className={`text-xs ${TREND_TONE[trend]}`} title={t(`price.trend.${trend}`)}>
      <span aria-hidden="true">{TREND_MARK[trend]}</span>
      <span className="sr-only">{t(`price.trend.${trend}`)}</span>
    </span>
  );
}

/** What a product has cost over time: latest, average, range, trend, shops and the last observations. */
export function PriceHistoryView({ productId }: { productId: number }) {
  const t = useT();
  const currency = useCurrency();
  const { data } = useQuery({ queryKey: ['prices', productId], queryFn: () => api.get<PriceHistory>(`/products/${productId}/prices`) });
  if (!data) return null;
  if (data.freeform)
    return (
      <p className="text-xs text-muted">
        {t('price.freeform', { price: formatMoney(data.freeform.latestCents, currency), unit: data.freeform.unit })}
        {data.freeform.trend && <span className={` ${TREND_TONE[data.freeform.trend]}`}>{t(`price.trend.${data.freeform.trend}`)}</span>}
      </p>
    );
  if (data.count === 0 || !data.per) return <p className="text-xs text-muted">{t('price.none')}</p>;
  const unit = t(`price.unit.${data.per}`);
  const money = (cents: number | null) => (cents === null ? '–' : `${formatMoney(cents, currency)} / ${unit}`);
  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        {(
          [
            ['price.latest', data.latestCents],
            ['price.average', data.averageCents],
            ['price.lowest', data.minCents],
            ['price.highest', data.maxCents],
          ] as const
        ).map(([key, cents]) => (
          <div key={key} className="flex justify-between gap-2">
            <dt className="text-muted">{t(key)}</dt>
            <dd className="tabular-nums">{money(cents)}</dd>
          </div>
        ))}
      </dl>
      {data.trend && <p className={`text-xs ${TREND_TONE[data.trend]}`}>{t(`price.trend.${data.trend}`)}</p>}
      {data.high && <p className="text-xs text-warn">{t('price.high.hint')}</p>}
      {data.cheapestStore && <p className="text-xs">{t('price.cheapest', { store: data.cheapestStore })}</p>}
      {data.alternative && <UnitPrice price={data.alternative} className="block text-xs text-muted" />}
      {data.byStore.length > 1 && (
        <div>
          <p className="text-xs font-medium text-muted">{t('price.byStore')}</p>
          <ul className="text-xs">
            {data.byStore.map((s) => (
              <li key={s.store} className="flex justify-between gap-2">
                <span>{s.store}</span>
                <span className="tabular-nums">{money(s.latestCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="text-xs text-muted">
        {data.observations.slice(0, 5).map((o) => (
          <li key={o.id} className="flex justify-between gap-2">
            <span>
              {formatDate(o.date)}
              {o.store ? ` · ${o.store}` : o.source === 'manual' ? ` · ${t('price.source.manual')}` : ''}
            </span>
            <span className="tabular-nums">{money(o.cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
