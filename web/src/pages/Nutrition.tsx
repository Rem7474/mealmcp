import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { type MessageKey, useT } from '../i18n';
import type { HouseholdSettings, NutritionHit, NutrientValues, Product, RecipeNutritionInfo } from '../types';
import { Badge, Button, Input } from '../ui';
import { parseQty, useProducts } from './shared';

/** The nutrition module is optional (household setting): nothing here shows or calls out until it is on. */
export function useNutritionEnabled(): boolean {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<HouseholdSettings>('/settings') });
  return !!data?.nutrition?.enabled;
}

const summary = (v: NutrientValues) =>
  [`${Math.round(v.kcal ?? 0)} kcal`, v.protein !== undefined ? `P ${v.protein}` : null, v.carbs !== undefined ? `G ${v.carbs}` : null, v.fat !== undefined ? `L ${v.fat}` : null].filter(Boolean).join(' · ');

/** Calories and macros of a recipe, per serving, with how many ingredients had values. */
export function RecipeNutrition({ id }: { id: number }) {
  const t = useT();
  const on = useNutritionEnabled();
  const { data } = useQuery({ queryKey: ['recipe', id, 'nutrition'], enabled: on, queryFn: () => api.get<RecipeNutritionInfo>(`/recipes/${id}/nutrition`) });
  if (!on || !data) return null;
  const { perServing: p, coverage } = data;
  return (
    <div className="mt-2 text-sm">
      {coverage.covered === 0 ? (
        <p className="text-muted">{t('nutrition.none')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">{t('nutrition.perServing')}</span>
            <Badge tone="accent">{Math.round(p.kcal)} kcal</Badge>
            <Badge>{t('nutrition.protein')} {p.protein} g</Badge>
            <Badge>{t('nutrition.carbs')} {p.carbs} g</Badge>
            <Badge>{t('nutrition.fat')} {p.fat} g</Badge>
            <Badge>{t('nutrition.fiber')} {p.fiber} g</Badge>
          </div>
          {!coverage.complete && <p className="mt-1 text-muted">{t('nutrition.incomplete', { names: coverage.missing.join(', ') })}</p>}
        </>
      )}
    </div>
  );
}

/** Per-product values: looked up on Open Food Facts (only the product name is sent) or typed by hand. */
export function ProductNutritionCard() {
  const t = useT();
  const on = useNutritionEnabled();
  const products = useProducts();
  const [open, setOpen] = useState<number | null>(null);
  if (!on || !products.data || products.data.length === 0) return null;
  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">{t('nutrition.products.title')}</summary>
      <p className="mt-2 text-sm text-muted">{t('nutrition.products.help')}</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {products.data.map((p) => (
          <li key={p.id} className="py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="min-w-40 flex-1">
                <div className="font-medium wrap-break-word">{p.name}</div>
                <div className="text-xs text-muted">
                  {p.nutrition ? `${summary(p.nutrition.per100)} (${p.nutrition.source === 'openfoodfacts' ? 'Open Food Facts' : t('nutrition.manual')})` : t('nutrition.unset')}
                </div>
              </div>
              <Button variant="ghost" className="h-8 px-2 text-xs" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
                {t('nutrition.edit')}
              </Button>
            </div>
            {open === p.id && <ProductEditor product={p} onDone={() => setOpen(null)} />}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{t('nutrition.credit')}</p>
    </details>
  );
}

function ProductEditor({ product, onDone }: { product: Product; onDone: () => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const [query, setQuery] = useState(product.name);
  const [hits, setHits] = useState<NutritionHit[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ kcal: '', protein: '', carbs: '', fat: '' });

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setHits(await api.get<NutritionHit[]>(`/nutrition/search?query=${encodeURIComponent(query)}`));
    } catch (err) {
      setHits(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const save = async (body: Record<string, unknown>) => {
    await run(() => api.put(`/products/${product.id}/nutrition`, body));
    onDone();
  };
  const saveManual = (e: FormEvent) => {
    e.preventDefault();
    const num = (v: string) => parseQty(v);
    const kcal = num(manual.kcal);
    if (kcal === undefined || Number.isNaN(kcal)) return;
    const per100: Record<string, number> = { kcal };
    for (const k of ['protein', 'carbs', 'fat'] as const) {
      const v = num(manual[k]);
      if (v !== undefined && !Number.isNaN(v)) per100[k] = v;
    }
    void save({ per100 });
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg bg-ink/5 p-3">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <Input required minLength={2} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('nutrition.searchAria', { name: product.name })} className="min-w-0 flex-1 basis-48" />
        <Button type="submit" disabled={busy}>
          {t('nutrition.search')}
        </Button>
      </form>
      {error && <p className="text-danger">{error}</p>}
      {hits && hits.length === 0 && <p className="text-muted">{t('nutrition.noHits')}</p>}
      {hits && hits.length > 0 && (
        <ul className="space-y-1">
          {hits.map((h) => (
            <li key={h.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="min-w-40 flex-1">
                <div className="wrap-break-word">{h.name}{h.brands ? ` · ${h.brands}` : ''}</div>
                <div className="text-xs text-muted">{summary(h.per100)}</div>
              </div>
              <Button className="h-8 px-2 text-xs" disabled={pending} onClick={() => save({ code: h.code })}>
                {t('nutrition.use')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={saveManual} className="flex flex-wrap items-center gap-2">
        <span className="text-muted">{t('nutrition.manualHelp')}</span>
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <Input key={k} inputMode="decimal" placeholder={k === 'kcal' ? 'kcal' : t(`nutrition.${k}` as MessageKey)} aria-label={t(`nutrition.${k}Aria` as MessageKey, { name: product.name })} value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} className="h-8 w-20 px-2 text-right" />
        ))}
        <Button type="submit" className="h-8 px-2 text-xs" disabled={pending}>
          {t('nutrition.save')}
        </Button>
        {product.nutrition && (
          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={pending} onClick={() => save({})}>
            {t('nutrition.clear')}
          </Button>
        )}
      </form>
    </div>
  );
}
