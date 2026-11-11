import { useQuery } from '@tanstack/react-query';
import type { SelectHTMLAttributes } from 'react';
import { api } from '../api';
import { LOCATION_LABELS } from '../format';
import type { Product } from '../types';
import { Select } from '../ui';

export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });

/** Autocomplete source for product-name inputs: use with `list="product-names"`. */
export function ProductDatalist() {
  const { data = [] } = useProducts();
  return (
    <>
      <datalist id="product-names">
        {data.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <datalist id="unit-names">
        {['g', 'kg', 'ml', 'cl', 'l', 'pièce', 'boîte', 'sachet', 'bouteille'].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </>
  );
}

export function LocationSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select aria-label="Emplacement" {...props}>
      {Object.entries(LOCATION_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}

/** "" -> undefined, otherwise a number (accepts a decimal comma). */
export const parseQty = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : undefined);
