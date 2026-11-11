import { Heart } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { formatDate, formatMoney, formatQty } from '../format';
import { locale, type MessageKey, useI18n, useT } from '../i18n';
import type { Availability, Produce, Recipe, RecipeCost, RecipeSummary, Seasonal } from '../types';
import { Badge, Button, Card, Empty, Input, Select, Stars } from '../ui';
import { RecipeNutrition } from './Nutrition';
import { parseQty, ProductDatalist, useCurrency } from './shared';

type View = { mode: 'list' } | { mode: 'detail'; id: number } | { mode: 'edit'; recipe?: Recipe };

export function Recipes() {
  const t = useT();
  // `#recipes/12` (a link from the planning) opens that recipe directly.
  const [view, setView] = useState<View>(() => {
    const id = Number(location.hash.match(/^#recipes\/(\d+)/)?.[1]);
    return id ? { mode: 'detail', id } : { mode: 'list' };
  });
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<'name' | 'rating'>('name');
  const { data: found = [] } = useQuery({
    queryKey: ['recipes', search, tag, favoritesOnly],
    queryFn: () => api.get<RecipeSummary[]>(`/recipes?search=${encodeURIComponent(search)}&tag=${encodeURIComponent(tag)}${favoritesOnly ? '&favorite=true' : ''}`),
  });
  // Best rated first: favorites, then stars, then name (the server already sorts by name).
  const recipes = sort === 'rating' ? [...found].sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.rating ?? 0) - (a.rating ?? 0)) : found;
  // Unfiltered list, only to know which tags exist.
  const { data: all = [] } = useQuery({ queryKey: ['recipes', '', '', false], queryFn: () => api.get<RecipeSummary[]>('/recipes?search=&tag=') });
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));

  if (view.mode === 'edit')
    return <RecipeForm recipe={view.recipe} onDone={(id) => setView(id ? { mode: 'detail', id } : { mode: 'list' })} />;
  const selected = view.mode === 'detail' ? view.id : null;

  const list = (
    <div className="min-w-0 space-y-3">
      <SeasonCard />
      <div className="flex gap-2">
        <Input type="search" placeholder={t('recipes.search')} aria-label={t('recipes.searchAria')} value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <Button variant="primary" onClick={() => setView({ mode: 'edit' })}>
          {t('recipes.new')}
        </Button>
      </div>
      {/* One swipeable row of filters on phones (it used to take three lines before the first recipe). */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        <Select aria-label={t('recipes.sort.name')} value={sort} onChange={(e) => setSort(e.target.value as 'name' | 'rating')} className="h-8 text-xs">
          <option value="name">{t('recipes.sort.name')}</option>
          <option value="rating">{t('recipes.sort.rating')}</option>
        </Select>
        <Button variant={favoritesOnly ? 'primary' : 'secondary'} className="h-8 px-3" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>
          <Heart size={14} weight={favoritesOnly ? 'fill' : 'regular'} />
          {t('recipes.filter.favorites')}
        </Button>
        {tags.length > 0 &&
          ['', ...tags].map((value) => (
            <Button key={value} variant={tag === value ? 'primary' : 'secondary'} className="h-8 px-3" aria-pressed={tag === value} onClick={() => setTag(value)}>
              {value || t('recipes.filter.all')}
            </Button>
          ))}
      </div>
      {recipes.length === 0 ? (
        <Empty>{search || tag ? t('recipes.noMatch') : t('recipes.none')}</Empty>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[minmax(0,1fr)]">
          {recipes.map((r) => (
            <li key={r.id} className="min-w-0">
              <button
                onClick={() => setView({ mode: 'detail', id: r.id })}
                className={`h-full w-full cursor-pointer rounded-xl bg-surface p-3.5 text-left hover:shadow-[0_0_0_1px_var(--muted)] ${selected === r.id ? 'shadow-[0_0_0_1px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--line)]'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="line-clamp-2 min-w-0 flex-1 font-medium">{r.name}</span>
                  {r.favorite && <Heart size={14} weight="fill" className="shrink-0 text-accent" aria-label={t('recipes.favorite')} />}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  {r.rating ? <Stars value={r.rating} size={13} /> : null}
                  <span>
                    {t('common.servings', { n: r.servings })} · {t('recipes.ingredientCount', { n: r.ingredientCount })}
                    {r.prepMinutes || r.cookMinutes ? ` · ${t('common.minutes', { n: (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) })}` : ''}
                  </span>
                </div>
                {r.description && <p className="mt-2 line-clamp-2 text-sm">{r.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.map((x) => (
                    <Badge key={x}>{x}</Badge>
                  ))}
                  <Badge>{r.lastMadeOn ? t('recipes.lastMade', { date: formatDate(r.lastMadeOn) }) : t('recipes.neverMade')}</Badge>
                  {r.dietConflicts.length > 0 && <Badge tone="danger">{t('recipes.dietConflict', { items: r.dietConflicts.map((c) => c.ingredient).join(', ') })}</Badge>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // Wide screens keep the list next to the open recipe; narrow ones show one at a time.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className={selected === null ? '' : 'hidden lg:block'}>{list}</div>
      <div className={selected === null ? 'hidden lg:block' : ''}>
        {selected === null ? (
          <Empty>{t('recipes.pick')}</Empty>
        ) : (
          <RecipeDetail key={selected} id={selected} onBack={() => setView({ mode: 'list' })} onEdit={(recipe) => setView({ mode: 'edit', recipe })} />
        )}
      </div>
    </div>
  );
}

/** Fruit, vegetables and herbs in season where the household lives (see the country setting), for any month. */
function SeasonCard() {
  const t = useT();
  const { lang } = useI18n();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const { data } = useQuery({ queryKey: ['seasons', month], queryFn: () => api.get<Seasonal>(`/seasons?month=${month}`) });
  const name = (p: Produce) => p[lang];
  const monthName = (m: number) => new Intl.DateTimeFormat(locale(), { month: 'long' }).format(new Date(2024, m - 1, 1));
  return (
    <details className="rounded-xl bg-surface p-3.5 shadow-[0_0_0_1px_var(--line)]">
      <summary className="cursor-pointer text-sm font-semibold">{t('season.title')}</summary>
      <div className="mt-3 space-y-3 text-sm">
        <label className="flex flex-wrap items-center gap-2 text-muted">
          {t('season.help', { month: monthName(month) })}
          <Select aria-label={t('season.title')} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-8 text-xs">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {monthName(i + 1)}
              </option>
            ))}
          </Select>
        </label>
        {data &&
          (['fruit', 'vegetable', 'herb'] as const).map((kind) => {
            const list = data.inSeason.filter((p) => p.kind === kind);
            return list.length === 0 ? null : (
              <div key={kind}>
                <div className="mb-1 text-xs font-medium text-muted">{t(`season.${kind}` as MessageKey)}</div>
                <div className="flex flex-wrap gap-1">
                  {list.map((p) => (
                    <Badge key={p.id} tone="accent">
                      {name(p)}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        {data && data.lastMonth.length > 0 && <p className="text-muted">{t('season.ending', { list: data.lastMonth.map(name).join(', ') })}</p>}
        {data && data.startingNextMonth.length > 0 && <p className="text-muted">{t('season.next', { list: data.startingNextMonth.map(name).join(', ') })}</p>}
      </div>
    </details>
  );
}

function RecipeDetail({ id, onBack, onEdit }: { id: number; onBack: () => void; onEdit: (recipe: Recipe) => void }) {
  const t = useT();
  const { data: recipe } = useQuery({ queryKey: ['recipe', id], queryFn: () => api.get<Recipe>(`/recipes/${id}`) });
  const { data: availability } = useQuery({
    queryKey: ['recipe', id, 'availability'],
    queryFn: () => api.get<Availability>(`/recipes/${id}/availability`),
  });
  const currency = useCurrency();
  const { data: cost } = useQuery({ queryKey: ['recipe', id, 'cost'], queryFn: () => api.get<RecipeCost>(`/recipes/${id}/cost`) });
  const { run, pending } = useAction();
  if (!recipe) return null;

  const remove = async () => {
    if (!confirm(t('recipes.confirmDelete', { name: recipe.name }))) return;
    await run(() => api.del(`/recipes/${id}`));
    onBack();
  };

  const times = [
    t('common.servings', { n: recipe.servings }),
    recipe.prepMinutes ? t('recipes.prep', { time: t('common.minutes', { n: recipe.prepMinutes }) }) : null,
    recipe.cookMinutes ? t('recipes.cooking', { time: t('common.minutes', { n: recipe.cookMinutes }) }) : null,
  ].filter(Boolean);

  return (
    <>
      <Button variant="ghost" className="px-0 lg:hidden" onClick={onBack}>
        {t('recipes.back')}
      </Button>
      <Card
        title={<span className="text-xl">{recipe.name}</span>}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => onEdit(recipe)}>{t('recipes.edit')}</Button>
            <Button variant="danger" disabled={pending} onClick={remove}>
              {t('recipes.delete')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Stars value={recipe.rating} label={(n) => t('recipes.rate', { n })} onChange={(rating) => run(() => api.patch(`/recipes/${id}`, { rating }))} />
          <Button variant="ghost" className="h-8 px-2" aria-pressed={recipe.favorite} onClick={() => run(() => api.patch(`/recipes/${id}`, { favorite: !recipe.favorite }))}>
            <Heart size={16} weight={recipe.favorite ? 'fill' : 'regular'} className={recipe.favorite ? 'text-accent' : ''} />
            {recipe.favorite ? t('recipes.unfavorite') : t('recipes.favorite')}
          </Button>
          <p className="text-sm text-muted">{times.join(' · ')}</p>
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {recipe.tags.map((x) => (
              <Badge key={x}>{x}</Badge>
            ))}
          </div>
        )}
        {recipe.equipment.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
            <span className="text-muted">{t('recipes.equipment')}:</span>
            {recipe.equipment.map((e) => (
              <Badge key={e.id} tone={e.owned ? undefined : 'warn'}>
                {e.name}
                {!e.owned && ` · ${t('recipes.equipment.missingBadge')}`}
              </Badge>
            ))}
          </div>
        )}
        {recipe.description && <p className="mt-2">{recipe.description}</p>}
        {cost && (
          <p className="mt-2 text-sm">
            {cost.totalCents > 0
              ? t('recipes.cost', { perServing: formatMoney(cost.perServingCents, currency), total: formatMoney(cost.totalCents, currency) })
              : t('recipes.cost.none')}
            {cost.totalCents > 0 && cost.unpricedIngredients.length > 0 && (
              <span className="text-muted"> {t('recipes.cost.unpriced', { names: cost.unpricedIngredients.join(', ') })}</span>
            )}
          </p>
        )}
        <RecipeNutrition id={id} />

        <h3 className="mt-4 mb-2 flex items-center gap-2 font-semibold">
          {t('recipes.ingredients')}
          {availability && (availability.canCook ? <Badge tone="accent">{t('recipes.allInStock')}</Badge> : <Badge tone="warn">{t('recipes.someMissing')}</Badge>)}
        </h3>
        <ul className="divide-y divide-line text-sm">
          {recipe.ingredients.map((ing, i) => {
            const status = availability?.ingredients[i];
            const missing = status?.missing ?? 0;
            return (
              <li key={ing.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="w-20 text-right text-muted">{ing.toTaste ? t('recipes.toTaste') : formatQty(ing.quantity, ing.unit)}</span>
                <span className="font-medium">{ing.name}</span>
                {ing.note && <span className="text-muted">({ing.note})</span>}
                {status?.staple && <span className="text-muted">· {t('recipes.staple')}</span>}
                {status?.approximate && <span className="text-muted">· {t('recipes.approximate')}</span>}
                {missing > 0 && <span className="text-warn">{t('recipes.missing', { qty: formatQty(missing, ing.unit) })}</span>}
              </li>
            );
          })}
        </ul>

        {recipe.steps.length > 0 && (
          <>
            <h3 className="mt-4 mb-2 font-semibold">{t('recipes.steps')}</h3>
            <ol className="space-y-2 text-sm">
              {recipe.steps.map((step) => (
                <li key={step.position} className="flex gap-3">
                  <span className="w-5 shrink-0 text-right text-muted">{step.position}.</span>
                  <div className="flex-1">
                    <span>{step.text}</span>
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {step.appliance && <Badge>{step.appliance}</Badge>}
                      {step.temperatureC !== null && <Badge>{step.temperatureC} °C</Badge>}
                      {step.durationMinutes !== null && <Badge>{t('common.minutes', { n: step.durationMinutes })}</Badge>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        {recipe.instructions && (
          <>
            <h3 className="mt-4 mb-2 font-semibold">{t('recipes.instructions')}</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{recipe.instructions}</p>
          </>
        )}
      </Card>
    </>
  );
}

interface Row {
  name: string;
  quantity: string;
  unit: string;
  note: string;
  toTaste: boolean;
}
const emptyRow = (): Row => ({ name: '', quantity: '', unit: '', note: '', toTaste: false });

interface StepRow {
  text: string;
  minutes: string;
  temperature: string;
  appliance: string;
}
const emptyStep = (): StepRow => ({ text: '', minutes: '', temperature: '', appliance: '' });

const positive = (value: string) => {
  const n = parseQty(value);
  return n !== undefined && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

function RecipeForm({ recipe, onDone }: { recipe?: Recipe; onDone: (id?: number) => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const [form, setForm] = useState({
    name: recipe?.name ?? '',
    description: recipe?.description ?? '',
    servings: String(recipe?.servings ?? 4),
    prepMinutes: recipe?.prepMinutes != null ? String(recipe.prepMinutes) : '',
    cookMinutes: recipe?.cookMinutes != null ? String(recipe.cookMinutes) : '',
    tags: recipe?.tags.join(', ') ?? '',
    instructions: recipe?.instructions ?? '',
    equipment: recipe?.equipment.map((e) => e.name).join(', ') ?? '',
  });
  const [rows, setRows] = useState<Row[]>(
    recipe?.ingredients.map((i) => ({
      name: i.name,
      quantity: i.toTaste ? '' : String(i.quantity),
      unit: i.unit === 'piece' ? '' : i.unit,
      note: i.note ?? '',
      toTaste: i.toTaste,
    })) ?? [emptyRow()],
  );
  const [steps, setSteps] = useState<StepRow[]>(
    recipe?.steps.map((s) => ({
      text: s.text,
      minutes: s.durationMinutes != null ? String(s.durationMinutes) : '',
      temperature: s.temperatureC != null ? String(s.temperatureC) : '',
      appliance: s.appliance ?? '',
    })) ?? [],
  );
  const setRow = (index: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const setStep = (index: number, patch: Partial<StepRow>) => setSteps((ss) => ss.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description || null,
      servings: Number(form.servings),
      prepMinutes: form.prepMinutes ? Number(form.prepMinutes) : null,
      cookMinutes: form.cookMinutes ? Number(form.cookMinutes) : null,
      tags: form.tags.split(',').map((x) => x.trim()).filter(Boolean),
      instructions: form.instructions || null,
      equipment: form.equipment.split(',').map((x) => x.trim()).filter(Boolean),
      steps: steps
        .filter((s) => s.text.trim())
        .map((s) => ({
          text: s.text.trim(),
          durationMinutes: positive(s.minutes),
          temperatureC: positive(s.temperature),
          appliance: s.appliance.trim() || undefined,
        })),
      ingredients: rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name,
          toTaste: r.toTaste,
          quantity: r.toTaste ? undefined : (parseQty(r.quantity) ?? 1),
          unit: r.unit || undefined,
          note: r.note || null,
        })),
    };
    const saved = (await run(() => (recipe ? api.patch<Recipe>(`/recipes/${recipe.id}`, body) : api.post<Recipe>('/recipes', body)))) as Recipe;
    onDone(saved.id);
  };

  return (
    <Card title={recipe ? t('recipes.form.editTitle') : t('recipes.form.newTitle')}>
      <ProductDatalist />
      <form onSubmit={submit} className="space-y-3">
        <Input required placeholder={t('recipes.form.name')} aria-label={t('recipes.form.nameAria')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" />
        <Input placeholder={t('recipes.form.description')} aria-label={t('recipes.form.descriptionAria')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full" />
        <div className="grid grid-cols-3 gap-2 text-xs text-muted sm:flex sm:flex-wrap sm:gap-3 sm:text-sm sm:text-ink">
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            {t('recipes.form.servings')}
            <Input type="number" min={1} required value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value })} className="w-full sm:w-20" />
          </label>
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            {t('recipes.form.time')}
            <Input type="number" min={0} value={form.prepMinutes} onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })} className="w-full sm:w-20" />
          </label>
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            {t('recipes.form.cookTime')}
            <Input type="number" min={0} value={form.cookMinutes} onChange={(e) => setForm({ ...form, cookMinutes: e.target.value })} className="w-full sm:w-20" />
          </label>
        </div>
        <Input placeholder={t('recipes.form.equipment')} aria-label={t('recipes.form.equipment')} value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} className="w-full" />
        <Input placeholder={t('recipes.form.tags')} aria-label={t('recipes.form.tags')} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full" />

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">{t('recipes.ingredients')}</legend>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-2 rounded-lg border border-line p-2 sm:flex sm:flex-wrap sm:items-center sm:border-0 sm:p-0">
              <Input disabled={row.toTaste} inputMode="decimal" placeholder={t('common.qty')} aria-label={t('common.quantity')} value={row.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} className="w-full sm:w-20" />
              <Input disabled={row.toTaste} list="unit-names" placeholder={t('common.unit')} aria-label={t('common.unit')} value={row.unit} onChange={(e) => setRow(i, { unit: e.target.value })} className="w-full sm:w-24" />
              <Input list="product-names" placeholder={t('recipes.form.ingredient')} aria-label={t('recipes.form.ingredient')} value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} className="col-span-2 row-start-1 flex-1 basis-32" />
              <Input placeholder={t('recipes.form.note')} aria-label={t('recipes.form.note')} value={row.note} onChange={(e) => setRow(i, { note: e.target.value })} className="col-span-3 flex-1 basis-24" />
              <label className="col-start-3 row-start-2 flex items-center gap-1 text-sm">
                <input type="checkbox" className="size-4 accent-(--accent)" checked={row.toTaste} onChange={(e) => setRow(i, { toTaste: e.target.checked })} />
                {t('recipes.form.toTaste')}
              </label>
              <Button variant="ghost" className="col-start-3 row-start-1 px-2" aria-label={t('recipes.form.removeIngredient')} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ))}
          <Button onClick={() => setRows([...rows, emptyRow()])}>{t('recipes.form.addIngredient')}</Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">{t('recipes.form.steps')}</legend>
          {steps.map((step, i) => (
            <div key={i} className="grid grid-cols-[1.5rem_repeat(3,minmax(0,1fr))_auto] gap-2 rounded-lg border border-line p-2 sm:flex sm:flex-wrap sm:items-center sm:border-0 sm:p-0">
              <span className="w-5 text-right text-sm text-muted">{i + 1}.</span>
              <Input placeholder={t('recipes.form.step')} aria-label={t('recipes.form.step')} value={step.text} onChange={(e) => setStep(i, { text: e.target.value })} className="col-span-3 flex-1 basis-56" />
              <Input inputMode="numeric" placeholder={t('recipes.form.stepMinutes')} aria-label={t('recipes.form.stepMinutes')} value={step.minutes} onChange={(e) => setStep(i, { minutes: e.target.value })} className="col-start-2 w-full sm:w-16" />
              <Input inputMode="numeric" placeholder={t('recipes.form.stepTemperature')} aria-label={t('recipes.form.stepTemperature')} value={step.temperature} onChange={(e) => setStep(i, { temperature: e.target.value })} className="w-full sm:w-16" />
              <Input placeholder={t('recipes.form.stepAppliance')} aria-label={t('recipes.form.stepAppliance')} value={step.appliance} onChange={(e) => setStep(i, { appliance: e.target.value })} className="w-full sm:w-32" />
              <Button variant="ghost" className="px-2" aria-label={t('recipes.form.removeStep')} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ))}
          <Button onClick={() => setSteps([...steps, emptyStep()])}>{t('recipes.form.addStep')}</Button>
        </fieldset>

        <textarea
          placeholder={t('recipes.instructions')}
          aria-label={t('recipes.instructions')}
          rows={5}
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          className="w-full rounded-lg border border-line bg-surface p-3 text-sm focus:outline-2 focus:outline-accent"
        />

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {t('recipes.form.save')}
          </Button>
          <Button onClick={() => onDone(recipe?.id)}>{t('recipes.form.cancel')}</Button>
        </div>
      </form>
    </Card>
  );
}
