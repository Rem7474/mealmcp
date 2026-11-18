import { Basket, BookOpen } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { type MessageKey, useI18n } from '../i18n';
import type { StarterOverview } from '../types';
import { Button, Card, Sheet } from '../ui';

/** What the household can start from, in the language of the screen. */
function useStarter(enabled: boolean) {
  const { lang } = useI18n();
  return useQuery({ queryKey: ['starter', lang], queryFn: () => api.get<StarterOverview>(`/starter?lang=${lang}`), enabled });
}

function Tick({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-2.5 transition-colors ${disabled ? 'opacity-60' : ''} ${checked ? 'bg-accent/15 ring-2 ring-accent' : 'bg-surface hover:bg-surface-high'}`}
    >
      <input type="checkbox" className="size-5 shrink-0 accent-accent" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

const toggle = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
};

/** Tick what is at home, aisle by aisle: no quantity to type, everything ticked counts as "some at home". */
export function StarterStock({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const { run, pending } = useAction();
  const { data } = useStarter(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (picked.size === 0) return;
    await run(() => api.post('/starter/stock', { lang, products: [...picked] }));
    onClose();
  };

  return (
    <Sheet title={t('starter.stock.title')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">{t('starter.stock.intro')}</p>
        {data?.aisles.map((a) => (
          <section key={a.aisle} aria-label={t(`aisle.${a.aisle}` as MessageKey)}>
            <h3 className="mb-1.5 px-1 font-sans text-sm font-medium text-muted">{t(`aisle.${a.aisle}` as MessageKey)}</h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {a.products.map((p) => (
                <Tick
                  key={p.key}
                  label={p.name}
                  hint={p.staple ? t('starter.stock.staple') : undefined}
                  checked={p.added || picked.has(p.key)}
                  disabled={p.added}
                  onChange={() => setPicked(toggle(picked, p.key))}
                />
              ))}
            </div>
          </section>
        ))}
        <Button type="submit" variant="primary" disabled={pending || picked.size === 0} className="h-12 w-full text-base sm:h-12">
          {t('starter.stock.submit', { n: picked.size })}
        </Button>
      </form>
    </Sheet>
  );
}

/** Pick simple recipes to start with; ones already in the household are shown as such and left alone. */
export function StarterRecipes({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const { run, pending } = useAction();
  const { data } = useStarter(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const free = data?.recipes.filter((r) => !r.imported) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (picked.size === 0) return;
    await run(() => api.post('/starter/recipes', { lang, recipes: [...picked] }));
    onClose();
  };

  return (
    <Sheet title={t('starter.recipes.title')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">{t('starter.recipes.intro')}</p>
        {free.length > 1 && (
          <Button compact onClick={() => setPicked(picked.size === free.length ? new Set() : new Set(free.map((r) => r.key)))}>
            {picked.size === free.length ? t('starter.recipes.none') : t('starter.recipes.all')}
          </Button>
        )}
        <div className="grid gap-1.5">
          {data?.recipes.map((r) => (
            <Tick
              key={r.key}
              label={r.name}
              hint={`${t('starter.recipes.meta', { n: r.servings, min: r.minutes })} · ${r.ingredients.slice(0, 4).join(', ')}${r.imported ? ` · ${t('starter.recipes.have')}` : ''}`}
              checked={r.imported || picked.has(r.key)}
              disabled={r.imported}
              onChange={() => setPicked(toggle(picked, r.key))}
            />
          ))}
        </div>
        <Button type="submit" variant="primary" disabled={pending || picked.size === 0} className="h-12 w-full text-base sm:h-12">
          {t('starter.recipes.submit', { n: picked.size })}
        </Button>
      </form>
    </Sheet>
  );
}

/** The empty-state invitation of the stock page: starts the aisle picker. */
export function StarterStockCard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card title={t('starter.stock.cardTitle')}>
      <p className="mb-3 text-sm text-muted">{t('starter.stock.cardBody')}</p>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Basket size={16} />
        {t('starter.stock.open')}
      </Button>
      {open && <StarterStock onClose={() => setOpen(false)} />}
    </Card>
  );
}

/** The empty-state invitation of the recipes page: starts the recipe picker. */
export function StarterRecipesCard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card title={t('starter.recipes.cardTitle')}>
      <p className="mb-3 text-sm text-muted">{t('starter.recipes.cardBody')}</p>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <BookOpen size={16} />
        {t('starter.recipes.open')}
      </Button>
      {open && <StarterRecipes onClose={() => setOpen(false)} />}
    </Card>
  );
}
