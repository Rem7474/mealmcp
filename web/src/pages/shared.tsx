import { useQuery } from '@tanstack/react-query';
import type { SelectHTMLAttributes } from 'react';
import { api } from '../api';
import { LOCATIONS } from '../format';
import { useT } from '../i18n';
import type { Product } from '../types';
import { Select } from '../ui';
import { fetchMe, meKey } from './AuthPage';

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
