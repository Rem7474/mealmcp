import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  ChefHat,
  Plus,
  ShoppingCart,
  Users,
  Wallet,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatDate, formatDay, formatMoney, fromIso, MEALS, monthStart, today, weekStart } from '../format';
import { locale, useT } from '../i18n';
import type { BudgetStatus, HouseholdSettings, MealType, PlanCost, PlannedMeal, PlanSlot, RecipeSummary, Suggestions } from '../types';
import { Accordion, Button, Card, Input, Select } from '../ui';
import { useCurrency } from './shared';

type Composer = { date: string; mealType: MealType } | null;
type MealInsight = PlanCost['meals'][number];

export function Planning() {
  const t = useT();
  const [start, setStart] = useState(() => weekStart(today()));
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const { data: meals = [] } = useQuery({
    queryKey: ['plan', start],
    queryFn: () => api.get<PlannedMeal[]>(`/plan?from=${start}&to=${end}`),
  });
  const currency = useCurrency();
  const { data: slots = [] } = useQuery({
    queryKey: ['plan', start, 'slots'],
    queryFn: () => api.get<PlanSlot[]>(`/plan/slots?from=${start}&to=${end}`),
  });
  const { data: cost } = useQuery({
    queryKey: ['plan', start, 'cost'],
    queryFn: () => api.get<PlanCost>(`/budget/plan-cost?from=${start}&to=${end}`),
  });
  const insights = new Map((cost?.meals ?? []).map((m) => [m.id, m]));
  const { run, pending } = useAction();
  const [generated, setGenerated] = useState(false);
  // The add-a-meal form opens from the toolbar, or from the "+" of an empty cell with that cell preselected.
  const [composer, setComposer] = useState<Composer>(null);

  const toggleComposer = () => setComposer(composer ? null : { date: days.includes(today()) ? today() : start, mealType: 'dinner' });

  const generate = async () => {
    await run(() => api.post('/shopping/generate', { from: start, to: end }));
    setGenerated(true);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="w-9 px-0" aria-label={t('plan.prevWeek')} onClick={() => setStart(addDays(start, -7))}>
          <CaretLeft size={16} />
        </Button>
        <Button className="w-9 px-0" aria-label={t('plan.nextWeek')} onClick={() => setStart(addDays(start, 7))}>
          <CaretRight size={16} />
        </Button>
        {start !== weekStart(today()) && (
          <Button variant="ghost" onClick={() => setStart(weekStart(today()))}>
            {t('plan.thisWeek')}
          </Button>
        )}
        <h2 className="ml-1 min-w-0 flex-1 truncate text-lg lg:flex-none lg:text-xl">
          {formatDate(start)} – {formatDate(end)}
        </h2>
        <span className="hidden flex-1 lg:block" />
        {/* Phones: the navigation sits on the first line, the week's cost and the main action on the second. */}
        <span className="order-1 h-0 basis-full lg:hidden" />
        {cost && cost.totalCents > 0 && (
          <div className="order-1 min-w-0 flex-1 lg:order-none lg:mr-2 lg:flex-none lg:text-right">
            <div className="text-xs tracking-wider text-muted uppercase">{t('plan.weekEstimate')}</div>
            <div className="text-base tabular-nums">
              {formatMoney(cost.totalCents, currency)}
              {cost.incompleteMeals > 0 && (
                <span className="hidden text-xs text-muted sm:inline"> · {t('plan.cost.incomplete', { n: cost.incompleteMeals })}</span>
              )}
            </div>
          </div>
        )}
        {generated && <span className="order-1 text-sm text-accent lg:order-none">{t('plan.listUpdated')}</span>}
        <Button className="max-sm:hidden" onClick={toggleComposer}>
          <Plus size={16} />
          {t('plan.add.title')}
        </Button>
        <Button variant="primary" className="order-1 lg:order-none" disabled={pending} onClick={generate}>
          <ShoppingCart size={16} />
          {t('plan.generate')}
        </Button>
      </div>

      {composer && <AddMeal key={`${composer.date}-${composer.mealType}`} preset={composer} onClose={() => setComposer(null)} />}

      <UseItUp />

      <WeekMatrix days={days} meals={meals} slots={slots} insights={insights} onAdd={(date, mealType) => setComposer({ date, mealType })} />
      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {days.map((day) => {
          const dayMeals = meals.filter((m) => m.date === day);
          const daySlots = slots.filter((slot) => slot.date === day);
          return (
            <section
              key={day}
              className={`rounded-xl bg-surface p-3 ${day === today() ? 'shadow-[0_0_0_1px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--line)]'}`}
            >
              {dayMeals.length === 0 && daySlots.length === 0 ? (
                // An empty day takes one line: six of them should not push the week's meals off the screen.
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <h2 className="font-medium first-letter:uppercase">{formatDay(day)}</h2>
                  <p className="text-muted">{t('plan.nothing')}</p>
                </div>
              ) : (
                <>
                  <h2 className="mb-2 text-sm font-medium first-letter:uppercase">{formatDay(day)}</h2>
                  <ul className="space-y-3">
                    {dayMeals.map((meal) => (
                      <li key={meal.id}>
                        <div className="mb-0.5 text-xs text-muted">{t(`meal.${meal.mealType}`)}</div>
                        <MealCard meal={meal} insight={insights.get(meal.id)} />
                      </li>
                    ))}
                    {daySlots.map((slot) => (
                      <li key={slot.mealType}>
                        <button
                          type="button"
                          onClick={() => setComposer({ date: day, mealType: slot.mealType })}
                          className="min-h-11 w-full cursor-pointer rounded-lg border border-dashed border-control px-2 py-1.5 text-left text-sm text-muted hover:border-accent hover:text-accent"
                        >
                          {t('plan.slot', { meal: t(`meal.${slot.mealType}`) })}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}
      </div>

      <BudgetStrip />

      {/* Phones: the main action floats within thumb reach, above the tab bar. */}
      <button
        type="button"
        aria-label={t('plan.add.title')}
        title={t('plan.add.title')}
        onClick={toggleComposer}
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 grid size-14 cursor-pointer place-items-center rounded-full border border-accent bg-surface text-accent-soft shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_14px_var(--glow)] active:bg-accent/25 sm:hidden"
      >
        {composer ? <X size={24} /> : <Plus size={24} />}
      </button>
    </>
  );
}

/** Where the month stands against its budget, so the week's plan is read in context. */
function BudgetStrip() {
  const t = useT();
  const currency = useCurrency();
  const { data } = useQuery({ queryKey: ['budget', 'status'], queryFn: () => api.get<BudgetStatus>('/budget/status') });
  if (!data?.budgetCents) return null;
  const pct = Math.min(100, (data.spentCents / data.budgetCents) * 100);
  const projectedPct = Math.min(100, (data.projectedCents / data.budgetCents) * 100);
  const over = data.projectedCents > data.budgetCents;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-lg bg-linear-to-r from-surface to-transparent px-3.5 py-3 text-sm">
      <div className="flex items-center gap-1.5">
        <Wallet size={16} className="text-accent" />
        {t('plan.budget', { month: new Date(monthStart(today())).toLocaleDateString(locale(), { month: 'long' }) })}
      </div>
      <div className="relative h-1.5 rounded-full bg-line">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent shadow-[0_0_10px_var(--glow)]" style={{ width: `${pct}%` }} />
        {projectedPct > pct && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: `${pct}%`,
              width: `${projectedPct - pct}%`,
              background: `repeating-linear-gradient(135deg, color-mix(in srgb, var(--${over ? 'warn' : 'accent'}) 45%, transparent) 0 3px, transparent 3px 7px)`,
            }}
          />
        )}
      </div>
      <div className="tabular-nums">
        {formatMoney(data.spentCents, currency)} <span className="text-muted">/ {formatMoney(data.budgetCents, currency)} · </span>
        <span className={over ? 'text-warn' : 'text-muted'}>
          {t('plan.budget.projected', { amount: formatMoney(data.projectedCents, currency) })}
        </span>
      </div>
    </div>
  );
}

/** Desktop week view: meals as rows, days as columns, today highlighted with the accent line. */
function WeekMatrix({
  days,
  meals,
  slots,
  insights,
  onAdd,
}: {
  days: string[];
  meals: PlannedMeal[];
  slots: PlanSlot[];
  insights: Map<number, MealInsight>;
  onAdd: (date: string, mealType: MealType) => void;
}) {
  const t = useT();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<HouseholdSettings>('/settings') });
  // Rows follow the household settings (the meals it plans each week), plus any meal already planned.
  // Without settings, lunch and dinner are shown.
  const expected = MEALS.filter((m) => (settings?.plannedMeals?.[m]?.length ?? 0) > 0);
  const rows = MEALS.filter(
    (m) => (expected.length > 0 ? expected.includes(m) : ['lunch', 'dinner'].includes(m)) || meals.some((x) => x.mealType === m),
  );
  const hidden = MEALS.filter((m) => !rows.includes(m));
  const columns = 'grid grid-cols-[5.5rem_repeat(7,minmax(0,1fr))] gap-1.5';

  return (
    <div className="hidden space-y-1.5 lg:block">
      <div className={columns}>
        <div />
        {days.map((day) => {
          const isToday = day === today();
          return (
            <div key={day} className={`relative rounded-t-lg px-2.5 pt-2 pb-1.5 ${isToday ? 'bg-accent/10' : ''}`}>
              {isToday && <span className="absolute inset-x-2.5 top-0 h-0.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}
              <div className={`text-xs first-letter:uppercase ${isToday ? 'text-accent-soft' : 'text-muted'}`}>
                {fromIso(day).toLocaleDateString(locale(), { weekday: 'short' })}
              </div>
              <div className="text-[22px] leading-tight tabular-nums">{fromIso(day).getDate()}</div>
            </div>
          );
        })}
      </div>
      {rows.map((mealType) => (
        <div key={mealType} className={columns}>
          <div className="pt-3 text-xs text-muted">{t(`meal.${mealType}`)}</div>
          {days.map((day) => {
            const here = meals.filter((m) => m.date === day && m.mealType === mealType);
            const expected = slots.some((x) => x.date === day && x.mealType === mealType);
            return (
              <div key={day} className={`flex min-h-24 flex-col gap-1.5 rounded-lg p-1 ${day === today() ? 'bg-accent/10' : ''}`}>
                {here.map((meal) => (
                  <div
                    key={meal.id}
                    className={`flex-1 rounded-lg bg-surface px-2.5 py-2 shadow-[0_0_0_1px_var(--line)] ${meal.cooked ? 'opacity-70' : ''}`}
                  >
                    <MealCard meal={meal} insight={insights.get(meal.id)} />
                  </div>
                ))}
                {here.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onAdd(day, mealType)}
                    aria-label={t('plan.slot', { meal: t(`meal.${mealType}`) })}
                    title={t('plan.slot', { meal: t(`meal.${mealType}`) })}
                    className={`grid flex-1 cursor-pointer place-items-center rounded-lg border border-dashed text-muted hover:border-accent hover:text-accent ${expected ? 'border-muted' : 'border-control'}`}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {hidden.length > 0 && (
        <div className={columns}>
          <div />
          <div className="col-span-7 flex items-center gap-1.5 px-1 py-1.5 text-xs text-muted">
            <CaretRight size={12} />
            {hidden.map((m) => t(`meal.${m}`)).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}

/** One planned meal: name (a link to the recipe), servings, estimated cost, stock status and the two actions. */
function MealCard({ meal, insight }: { meal: PlannedMeal; insight?: MealInsight }) {
  const t = useT();
  const currency = useCurrency();
  const { run, pending } = useAction();
  const missing = insight ? insight.missing.length : 0;
  const missingEquipment = insight?.missingEquipment ?? [];

  const actions = (
    <div className="ml-auto flex items-center gap-1 text-muted">
      {!meal.cooked && (
        <button
          type="button"
          className="inline-flex size-9 sm:size-6 cursor-pointer items-center justify-center rounded hover:bg-ink/10 hover:text-accent-soft disabled:opacity-45"
          disabled={pending}
          title={t('plan.cookTitle')}
          aria-label={t('plan.cookTitle')}
          onClick={() => run(() => api.post(`/plan/${meal.id}/cook`))}
        >
          <ChefHat size={14} />
        </button>
      )}
      <button
        type="button"
        className="inline-flex size-9 sm:size-6 cursor-pointer items-center justify-center rounded hover:bg-ink/10 hover:text-danger"
        title={t('plan.remove')}
        aria-label={t('plan.remove')}
        onClick={() => run(() => api.del(`/plan/${meal.id}`))}
      >
        <X size={14} />
      </button>
    </div>
  );

  // A free-text meal ("Leftovers", "Restaurant") has no recipe, cost or stock status, but its title wraps like any other.
  return (
    <div className="flex h-full flex-col gap-1 text-sm">
      <div className={`text-[13px] leading-tight font-medium text-pretty ${meal.cooked ? 'text-muted line-through' : ''}`}>
        {meal.recipeId ? (
          <a href={`#recipes/${meal.recipeId}`} className="hover:text-accent hover:underline">
            {meal.recipeName}
          </a>
        ) : (
          meal.title
        )}
      </div>
      {meal.cooked ? (
        <div className="flex items-center gap-1 text-xs text-muted">
          <CheckCircle size={13} />
          {t('plan.cooked')}
        </div>
      ) : (
        <>
          {insight?.canCook === false && (
            <div className="flex items-center gap-1 text-xs text-warn" title={insight.missing.join(', ')}>
              <WarningCircle size={13} />
              {t('plan.missing', { n: missing })}
            </div>
          )}
          {insight?.canCook === true && missingEquipment.length === 0 && (
            <div className="flex items-center gap-1 text-xs text-accent-soft">
              <Check size={13} />
              {t('plan.inStock')}
            </div>
          )}
          {missingEquipment.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-warn">
              <WarningCircle size={13} />
              {t('recipes.equipment.missing', { names: missingEquipment.join(', ') })}
            </div>
          )}
        </>
      )}
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex gap-2.5 text-xs text-muted tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Users size={12} />
            {meal.servings}
          </span>
          {insight?.costCents ? <span>{formatMoney(insight.costCents, currency)}</span> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}

function AddMeal({ preset, onClose }: { preset: { date: string; mealType: MealType }; onClose: () => void }) {
  const t = useT();
  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', '', ''],
    queryFn: () => api.get<RecipeSummary[]>('/recipes?search=&tag='),
  });
  const { run, pending } = useAction();
  const [form, setForm] = useState({ date: preset.date, mealType: preset.mealType, recipeId: '', title: '', servings: '' });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await run(() =>
      api.post('/plan', {
        date: form.date,
        mealType: form.mealType,
        recipeId: form.recipeId ? Number(form.recipeId) : null,
        title: form.recipeId ? null : form.title,
        servings: form.servings ? Number(form.servings) : undefined,
      }),
    );
    onClose();
  };

  // On a phone the form opens at the top while the user is scrolled down: bring it into view.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => top.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), []);

  return (
    <div ref={top} className="scroll-mt-16">
      <Card
        title={t('plan.add.title')}
        actions={
          <Button variant="ghost" className="w-9 px-0" aria-label={t('app.close')} onClick={onClose}>
            <X size={16} />
          </Button>
        }
      >
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <Input type="date" required aria-label={t('plan.add.date')} value={form.date} onChange={(e) => set({ date: e.target.value })} />
          <Select aria-label={t('plan.add.meal')} value={form.mealType} onChange={(e) => set({ mealType: e.target.value as MealType })}>
            {MEALS.map((value) => (
              <option key={value} value={value}>
                {t(`meal.${value}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('plan.add.recipe')}
            value={form.recipeId}
            onChange={(e) => set({ recipeId: e.target.value })}
            className="flex-1 basis-40"
          >
            <option value="">{t('plan.add.freeText')}</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          {!form.recipeId && (
            <Input
              required
              autoFocus
              placeholder={t('plan.add.titlePlaceholder')}
              aria-label={t('plan.add.titleAria')}
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              className="flex-1 basis-40"
            />
          )}
          <Input
            type="number"
            min={1}
            placeholder={t('plan.add.servings')}
            aria-label={t('plan.add.servingsAria')}
            value={form.servings}
            onChange={(e) => set({ servings: e.target.value })}
            className="w-24"
          />
          <Button type="submit" variant="primary" disabled={pending}>
            {t('plan.add.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** Recipes that would use up what is about to expire, so nothing gets thrown away. */
function UseItUp() {
  const t = useT();
  const { data } = useQuery({
    queryKey: ['recipes', 'suggest'],
    queryFn: () => api.get<Suggestions>('/recipes/suggest?withinDays=5&limit=3'),
  });
  if (!data || data.expiring.length === 0) return null;

  return (
    <Accordion
      summary={
        <>
          <ArrowsClockwise size={14} className="mr-1.5 inline text-accent" />
          {t('plan.useUp.title')} <span className="font-normal text-muted">({data.expiring.map((e) => e.name).join(', ')})</span>
        </>
      }
    >
      {data.suggestions.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('plan.useUp.none')}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {data.suggestions.map((s) => (
            <li key={s.recipeId}>
              <a href={`#recipes/${s.recipeId}`} className="font-medium hover:text-accent hover:underline">
                {s.name}
              </a>
              <span className="text-muted">
                {' '}
                · {t('plan.useUp.uses', { names: s.usesExpiring.map((u) => u.name).join(', ') })} ·{' '}
                {s.canCook ? t('plan.useUp.ready') : t('plan.useUp.missing', { names: s.missing.map((m) => m.name).join(', ') })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Accordion>
  );
}
