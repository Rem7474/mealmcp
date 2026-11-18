import { Heart, Play, Plus } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { api, useAction } from '../api';
import { formatDate, formatMoney, formatQty, MEALS, today } from '../format';
import { locale, type MessageKey, useI18n, useT } from '../i18n';
import type { Availability, MealType, Produce, Recipe, RecipeCost, RecipeSummary, Seasonal } from '../types';
import { Accordion, Badge, Button, Card, Empty, Field, Input, Select, Sheet, Stars } from '../ui';
import { CookingMode } from './CookingMode';
import { RecipeNutrition } from './Nutrition';
import { StarterRecipesCard } from './Starter';
import { ProductDatalist, parseQty, useCurrency } from './shared';

const TILE_TONES = [
  'bg-accent/20 text-accent-soft',
  'bg-herb/20 text-herb',
  'bg-warn/20 text-warn',
  'bg-danger/15 text-danger',
  'bg-ink/10 text-ink',
];
/** The same name always gets the same tile colour. */
const tileTone = (name: string) => [...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TILE_TONES.length;

type View = { mode: 'list' } | { mode: 'detail'; id: number; cook?: boolean; servings?: number } | { mode: 'edit'; recipe?: Recipe };

export function Recipes() {
  const t = useT();
  // `#recipes/12` (or `#recipes/12/cook?servings=4` from planning) opens that recipe directly.
  const viewFromHash = (): View => {
    const match = location.hash.match(/^#recipes\/(\d+)(\/cook)?(?:\?(.+))?/);
    if (!match) return { mode: 'list' };
    const id = Number(match[1]);
    const cook = Boolean(match[2]);
    const params = match[3] ? new URLSearchParams(match[3]) : null;
    const rawServings = Number(params?.get('servings'));
    const servings = Number.isInteger(rawServings) && rawServings > 0 ? rawServings : undefined;
    return { mode: 'detail', id, cook, servings };
  };
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const openDetail = (id: number) => {
    setView({ mode: 'detail', id });
    if (location.hash !== `#recipes/${id}`) history.pushState(null, '', `#recipes/${id}`);
  };
  const openList = () => {
    setView({ mode: 'list' });
    if (location.hash.startsWith('#recipes/')) history.pushState(null, '', '#recipes');
  };
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<'name' | 'rating'>('name');
  const { data: found = [], isSuccess: loaded } = useQuery({
    queryKey: ['recipes', search, tag, favoritesOnly, minRating],
    queryFn: () =>
      api.get<RecipeSummary[]>(
        `/recipes?search=${encodeURIComponent(search)}&tag=${encodeURIComponent(tag)}${favoritesOnly ? '&favorite=true' : ''}${minRating > 0 ? `&minRating=${minRating}` : ''}`,
      ),
  });
  // Best rated first: favorites, then stars, then name (the server already sorts by name).
  const recipes =
    sort === 'rating' ? [...found].sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.rating ?? 0) - (a.rating ?? 0)) : found;
  // Unfiltered list, only to know which tags exist.
  const { data: all = [] } = useQuery({
    queryKey: ['recipes', '', '', false],
    queryFn: () => api.get<RecipeSummary[]>('/recipes?search=&tag='),
  });
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));

  if (view.mode === 'edit') return <RecipeForm recipe={view.recipe} onDone={(id) => (id ? openDetail(id) : openList())} />;
  const selected = view.mode === 'detail' ? view.id : null;
  // Wide screens never show an empty detail pane: the first recipe of the list is previewed until one is chosen.
  const wide = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
  const shown = selected ?? (wide ? (recipes[0]?.id ?? null) : null);

  const list = (
    <div className="min-w-0 space-y-3">
      <div className="flex gap-2">
        <Input
          type="search"
          placeholder={t('recipes.search')}
          aria-label={t('recipes.searchAria')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 flex-1"
        />
        <Button variant="primary" className="h-11 max-sm:hidden" onClick={() => setView({ mode: 'edit' })}>
          {t('recipes.new')}
        </Button>
      </div>
      {/* One swipeable row of filters on phones (it used to take three lines before the first recipe). */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        <Select
          aria-label={t('recipes.sort.name')}
          value={sort}
          onChange={(e) => setSort(e.target.value as 'name' | 'rating')}
          className="h-8 text-xs"
        >
          <option value="name">{t('recipes.sort.name')}</option>
          <option value="rating">{t('recipes.sort.rating')}</option>
        </Select>
        <Select
          aria-label={t('recipes.minRating')}
          value={String(minRating)}
          onChange={(e) => setMinRating(Number(e.target.value))}
          className="h-8 text-xs"
        >
          <option value="0">{t('recipes.minRating.all')}</option>
          <option value="3">3+ ★</option>
          <option value="4">4+ ★</option>
          <option value="5">5 ★</option>
        </Select>
        <Button
          variant={favoritesOnly ? 'active' : 'secondary'}
          compact
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Heart size={14} weight={favoritesOnly ? 'fill' : 'regular'} />
          {t('recipes.filter.favorites')}
        </Button>
        {tags.length > 0 &&
          ['', ...tags].map((value) => (
            <Button
              key={value}
              variant={tag === value ? 'active' : 'secondary'}
              compact
              aria-pressed={tag === value}
              onClick={() => setTag(value)}
            >
              {value || t('recipes.filter.all')}
            </Button>
          ))}
      </div>
      {recipes.length === 0 ? (
        search || tag || favoritesOnly ? (
          <Empty>{t('recipes.noMatch')}</Empty>
        ) : (
          loaded && <StarterRecipesCard />
        )
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[minmax(0,1fr)]">
          {recipes.map((r) => (
            <li key={r.id} className="min-w-0">
              <button
                type="button"
                onClick={() => openDetail(r.id)}
                className={`flex h-full w-full cursor-pointer items-start gap-3 rounded-2xl bg-surface p-3.5 text-left transition-[background-color,transform] hover:bg-surface-high active:scale-[0.99] ${shown === r.id ? 'ring-2 ring-accent' : ''}`}
              >
                {/* A monogram tile gives every recipe a colour to find it by, until recipes carry photos. */}
                <span
                  aria-hidden="true"
                  className={`font-semibold tracking-tight grid size-14 shrink-0 place-items-center rounded-lg text-3xl ${TILE_TONES[tileTone(r.name)]}`}
                >
                  {r.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-2">
                    <span className="font-semibold tracking-tight line-clamp-2 min-w-0 flex-1 text-lg leading-snug">{r.name}</span>
                    {r.favorite && (
                      <Heart size={14} weight="fill" className="mt-1.5 shrink-0 text-accent" aria-label={t('recipes.favorite')} />
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
                    {r.prepMinutes || r.cookMinutes ? (
                      <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs text-accent-soft tabular-nums">
                        {t('common.minutes', { n: (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) })}
                      </span>
                    ) : null}
                    {r.rating ? <Stars value={r.rating} size={12} /> : null}
                    <span>{t('common.servings', { n: r.servings })}</span>
                  </span>
                  {r.description && <span className="mt-1.5 line-clamp-2 block text-sm">{r.description}</span>}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1">
                    {r.tags.map((x) => (
                      <Badge key={x}>{x}</Badge>
                    ))}
                    {r.dietConflicts.length > 0 && (
                      <Badge tone="danger">
                        {t('recipes.dietConflict', { items: r.dietConflicts.map((c) => c.ingredient).join(', ') })}
                      </Badge>
                    )}
                    {/* Only a recipe already cooked says so; "never made" is the default and stays quiet. */}
                    {r.lastMadeOn && (
                      <span className="text-xs text-muted">{t('recipes.lastMade', { date: formatDate(r.lastMadeOn) })}</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Seasonal produce is a side note: it comes after the recipes, not before them. */}
      <SeasonCard />
      {/* Phones: the main action floats within thumb reach, like on the planning. */}
      {selected === null && (
        <button
          type="button"
          aria-label={t('recipes.new')}
          title={t('recipes.new')}
          onClick={() => setView({ mode: 'edit' })}
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 grid size-14 cursor-pointer place-items-center rounded-full bg-accent text-accent-ink active:scale-95 sm:hidden"
        >
          <Plus size={24} weight="bold" />
        </button>
      )}
    </div>
  );

  // Wide screens keep the list next to the open recipe; narrow ones show one at a time.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className={selected === null ? '' : 'hidden lg:block'}>{list}</div>
      <div className={selected === null ? 'hidden lg:block' : ''}>
        {shown === null ? (
          <Empty>{t('recipes.pick')}</Empty>
        ) : (
          <RecipeDetail
            key={shown}
            id={shown}
            initialCook={view.mode === 'detail' ? view.cook : undefined}
            initialServings={view.mode === 'detail' ? view.servings : undefined}
            onBack={openList}
            onEdit={(recipe) => setView({ mode: 'edit', recipe })}
          />
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
    <Accordion summary={t('season.title')}>
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
        {data && data.lastMonth.length > 0 && (
          <p className="text-muted">{t('season.ending', { list: data.lastMonth.map(name).join(', ') })}</p>
        )}
        {data && data.startingNextMonth.length > 0 && (
          <p className="text-muted">{t('season.next', { list: data.startingNextMonth.map(name).join(', ') })}</p>
        )}
      </div>
    </Accordion>
  );
}

function RecipeDetail({
  id,
  initialCook,
  initialServings,
  onBack,
  onEdit,
}: {
  id: number;
  initialCook?: boolean;
  initialServings?: number;
  onBack: () => void;
  onEdit: (recipe: Recipe) => void;
}) {
  const [planning, setPlanning] = useState(false);
  const [cooking, setCooking] = useState(Boolean(initialCook));
  const [planned, setPlanned] = useState<string | null>(null);
  const [scaledServings, setScaledServings] = useState<number | null>(initialServings ?? null);
  const t = useT();
  useEffect(() => {
    setScaledServings(initialServings ?? null);
    setCooking(Boolean(initialCook));
  }, [id, initialCook, initialServings]);
  const { data: recipe } = useQuery({ queryKey: ['recipe', id], queryFn: () => api.get<Recipe>(`/recipes/${id}`) });
  const activeServings = scaledServings ?? recipe?.servings ?? 4;
  const { data: availability } = useQuery({
    queryKey: ['recipe', id, 'availability', activeServings],
    queryFn: () => api.get<Availability>(`/recipes/${id}/availability?servings=${activeServings}`),
    enabled: Boolean(recipe),
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
      {cooking && recipe.steps.length > 0 && (
        <CookingMode
          recipe={recipe}
          activeServings={activeServings}
          onClose={() => {
            setCooking(false);
            if (location.hash.includes('/cook')) history.replaceState(null, '', `#recipes/${id}`);
          }}
        />
      )}
      {planning && <PlanRecipe recipe={recipe} onClose={() => setPlanning(false)} onPlanned={(date) => setPlanned(date)} />}
      {planned && (
        <p role="status" className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-sm">
          {t('recipes.planned', { date: formatDate(planned) })}{' '}
          <a href="#planning" className="text-accent underline">
            {t('recipes.seePlan')}
          </a>
        </p>
      )}
      <Button variant="ghost" className="px-0 lg:hidden" onClick={onBack}>
        {t('recipes.back')}
      </Button>
      <Card
        title={<span className="text-xl">{recipe.name}</span>}
        actions={
          <div className="flex flex-wrap gap-2">
            {recipe.steps.length > 0 && (
              <Button variant="primary" onClick={() => setCooking(true)}>
                <Play size={16} weight="fill" />
                {t('cooking.start')}
              </Button>
            )}
            <Button variant={recipe.steps.length > 0 ? undefined : 'primary'} onClick={() => setPlanning(true)}>
              {t('recipes.plan')}
            </Button>
            <Button onClick={() => onEdit(recipe)}>{t('recipes.edit')}</Button>
            <Button variant="danger" disabled={pending} onClick={remove}>
              {t('recipes.delete')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Stars
            value={recipe.rating}
            label={(n) => t('recipes.rate', { n })}
            onChange={(rating) => run(() => api.patch(`/recipes/${id}`, { rating }))}
          />
          <Button
            variant="ghost"
            compact
            aria-pressed={recipe.favorite}
            onClick={() => run(() => api.patch(`/recipes/${id}`, { favorite: !recipe.favorite }))}
          >
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
              ? t('recipes.cost', {
                  perServing: formatMoney(cost.perServingCents, currency),
                  total: formatMoney(cost.totalCents, currency),
                })
              : t('recipes.cost.none')}
            {cost.totalCents > 0 && cost.unpricedIngredients.length > 0 && (
              <span className="text-muted"> {t('recipes.cost.unpriced', { names: cost.unpricedIngredients.join(', ') })}</span>
            )}
          </p>
        )}
        <RecipeNutrition id={id} />

        <h3 className="mt-4 mb-2 flex flex-wrap items-center gap-2 font-semibold">
          {t('recipes.ingredients')}
          <span className="inline-flex items-center gap-1 font-normal text-sm">
            <Button compact aria-label={t('recipes.servings.less')} onClick={() => setScaledServings(Math.max(1, activeServings - 1))}>
              -
            </Button>
            <span className="min-w-16 text-center tabular-nums">{t('common.servings', { n: activeServings })}</span>
            <Button compact aria-label={t('recipes.servings.more')} onClick={() => setScaledServings(activeServings + 1)}>
              +
            </Button>
          </span>
          {availability &&
            (availability.canCook ? (
              <Badge tone="accent">{t('recipes.allInStock')}</Badge>
            ) : (
              <Badge tone="warn">{t('recipes.someMissing')}</Badge>
            ))}
        </h3>
        <ul className="divide-y divide-line text-sm">
          {recipe.ingredients.map((ing, i) => {
            const status = availability?.ingredients[i];
            const missing = status?.missing ?? 0;
            const scaledQty = Math.round(((ing.quantity * activeServings) / recipe.servings) * 100) / 100;
            return (
              <li key={ing.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="w-20 text-right text-muted">{ing.toTaste ? t('recipes.toTaste') : formatQty(scaledQty, ing.unit)}</span>
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
const nonNegative = (value: string) => {
  const n = parseQty(value);
  return n !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};

/** Puts a recipe on the planning without leaving its page. */
function PlanRecipe({ recipe, onClose, onPlanned }: { recipe: Recipe; onClose: () => void; onPlanned: (date: string) => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const [date, setDate] = useState(today());
  const [mealType, setMealType] = useState<MealType>('dinner');
  const [servings, setServings] = useState(String(recipe.servings));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(() => api.post('/plan', { date, mealType, recipeId: recipe.id, servings: servings ? Number(servings) : undefined }));
    onPlanned(date);
    onClose();
  };

  return (
    <Sheet title={recipe.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('plan.add.date')}>
            <Input
              type="date"
              required
              aria-label={t('plan.add.date')}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label={t('plan.add.meal')}>
            <Select
              aria-label={t('plan.add.meal')}
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="w-full"
            >
              {MEALS.map((value) => (
                <option key={value} value={value}>
                  {t(`meal.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('plan.add.servingsAria')}>
          <Input
            type="number"
            min={1}
            aria-label={t('plan.add.servingsAria')}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            className="w-full"
          />
        </Field>
        <Button type="submit" variant="primary" disabled={pending} className="h-12 w-full text-base sm:h-12">
          {t('plan.add.submit')}
        </Button>
      </form>
    </Sheet>
  );
}

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
      tags: form.tags
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      equipment: form.equipment
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      steps: steps
        .filter((s) => s.text.trim())
        .map((s) => ({
          text: s.text.trim(),
          durationMinutes: positive(s.minutes),
          temperatureC: nonNegative(s.temperature),
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
    const saved = (await run(() =>
      recipe ? api.patch<Recipe>(`/recipes/${recipe.id}`, body) : api.post<Recipe>('/recipes', body),
    )) as Recipe;
    onDone(saved.id);
  };

  return (
    <Card title={recipe ? t('recipes.form.editTitle') : t('recipes.form.newTitle')}>
      <ProductDatalist />
      <form onSubmit={submit} className="space-y-3">
        <Input
          required
          placeholder={t('recipes.form.name')}
          aria-label={t('recipes.form.nameAria')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full"
        />
        <Input
          placeholder={t('recipes.form.description')}
          aria-label={t('recipes.form.descriptionAria')}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full"
        />
        <div className="grid grid-cols-3 gap-2 text-xs text-muted sm:flex sm:flex-wrap sm:gap-3 sm:text-sm sm:text-ink">
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            {t('recipes.form.servings')}
            <Input
              type="number"
              min={1}
              required
              value={form.servings}
              onChange={(e) => setForm({ ...form, servings: e.target.value })}
              className="w-full sm:w-20"
            />
          </label>
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            {t('recipes.form.time')}
            <Input
              type="number"
              min={0}
              value={form.prepMinutes}
              onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })}
              className="w-full sm:w-20"
            />
          </label>
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            {t('recipes.form.cookTime')}
            <Input
              type="number"
              min={0}
              value={form.cookMinutes}
              onChange={(e) => setForm({ ...form, cookMinutes: e.target.value })}
              className="w-full sm:w-20"
            />
          </label>
        </div>
        <Input
          placeholder={t('recipes.form.equipment')}
          aria-label={t('recipes.form.equipment')}
          value={form.equipment}
          onChange={(e) => setForm({ ...form, equipment: e.target.value })}
          className="w-full"
        />
        <Input
          placeholder={t('recipes.form.tags')}
          aria-label={t('recipes.form.tags')}
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          className="w-full"
        />

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">{t('recipes.ingredients')}</legend>
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-2 rounded-2xl bg-surface-high/60 p-2.5 sm:flex sm:flex-wrap sm:items-center sm:bg-transparent sm:p-0"
            >
              <Input
                disabled={row.toTaste}
                inputMode="decimal"
                placeholder={t('common.qty')}
                aria-label={t('common.quantity')}
                value={row.quantity}
                onChange={(e) => setRow(i, { quantity: e.target.value })}
                className="w-full sm:w-20"
              />
              <Input
                disabled={row.toTaste}
                list="unit-names"
                placeholder={t('common.unit')}
                aria-label={t('common.unit')}
                value={row.unit}
                onChange={(e) => setRow(i, { unit: e.target.value })}
                className="w-full sm:w-24"
              />
              <Input
                list="product-names"
                placeholder={t('recipes.form.ingredient')}
                aria-label={t('recipes.form.ingredient')}
                value={row.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                className="col-span-2 row-start-1 flex-1 basis-32"
              />
              <Input
                placeholder={t('recipes.form.note')}
                aria-label={t('recipes.form.note')}
                value={row.note}
                onChange={(e) => setRow(i, { note: e.target.value })}
                className="col-span-3 flex-1 basis-24"
              />
              <label className="col-start-3 row-start-2 flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-(--accent)"
                  checked={row.toTaste}
                  onChange={(e) => setRow(i, { toTaste: e.target.checked })}
                />
                {t('recipes.form.toTaste')}
              </label>
              <Button
                variant="ghost"
                className="col-start-3 row-start-1 px-2"
                aria-label={t('recipes.form.removeIngredient')}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button onClick={() => setRows([...rows, emptyRow()])}>{t('recipes.form.addIngredient')}</Button>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">{t('recipes.form.steps')}</legend>
          {steps.map((step, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.5rem_repeat(3,minmax(0,1fr))_auto] gap-2 rounded-2xl bg-surface-high/60 p-2.5 sm:flex sm:flex-wrap sm:items-center sm:bg-transparent sm:p-0"
            >
              <span className="w-5 text-right text-sm text-muted">{i + 1}.</span>
              <Input
                placeholder={t('recipes.form.step')}
                aria-label={t('recipes.form.step')}
                value={step.text}
                onChange={(e) => setStep(i, { text: e.target.value })}
                className="col-span-3 flex-1 basis-56"
              />
              <Input
                inputMode="numeric"
                placeholder={t('recipes.form.stepMinutes')}
                aria-label={t('recipes.form.stepMinutes')}
                value={step.minutes}
                onChange={(e) => setStep(i, { minutes: e.target.value })}
                className="col-start-2 w-full sm:w-16"
              />
              <Input
                inputMode="numeric"
                placeholder={t('recipes.form.stepTemperature')}
                aria-label={t('recipes.form.stepTemperature')}
                value={step.temperature}
                onChange={(e) => setStep(i, { temperature: e.target.value })}
                className="w-full sm:w-16"
              />
              <Input
                placeholder={t('recipes.form.stepAppliance')}
                aria-label={t('recipes.form.stepAppliance')}
                value={step.appliance}
                onChange={(e) => setStep(i, { appliance: e.target.value })}
                className="w-full sm:w-32"
              />
              <Button
                variant="ghost"
                className="px-2"
                aria-label={t('recipes.form.removeStep')}
                onClick={() => setSteps(steps.filter((_, j) => j !== i))}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button onClick={() => setSteps([...steps, emptyStep()])}>{t('recipes.form.addStep')}</Button>
        </fieldset>

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
