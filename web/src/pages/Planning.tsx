import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatDate, formatDay, formatMoney, fromIso, MEALS, today, weekStart } from '../format';
import { locale, useT } from '../i18n';
import type { MealType, PlanCost, PlanSlot, PlannedMeal, RecipeSummary, Suggestions } from '../types';
import { Badge, Button, Card, Input, Select } from '../ui';
import { useCurrency } from './shared';

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
  const { data: slots = [] } = useQuery({ queryKey: ['plan', start, 'slots'], queryFn: () => api.get<PlanSlot[]>(`/plan/slots?from=${start}&to=${end}`) });
  const { data: cost } = useQuery({ queryKey: ['plan', start, 'cost'], queryFn: () => api.get<PlanCost>(`/budget/plan-cost?from=${start}&to=${end}`) });
  const { run, pending } = useAction();
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    await run(() => api.post('/shopping/generate', { from: start, to: end }));
    setGenerated(true);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button aria-label={t('plan.prevWeek')} onClick={() => setStart(addDays(start, -7))}>
          ←
        </Button>
        <Button aria-label={t('plan.nextWeek')} onClick={() => setStart(addDays(start, 7))}>
          →
        </Button>
        <Button variant="ghost" onClick={() => setStart(weekStart(today()))}>
          {t('plan.thisWeek')}
        </Button>
        <span className="font-semibold">
          {formatDate(start)} – {formatDate(end)}
        </span>
        <span className="flex-1" />
        {generated && <span className="text-sm text-accent">{t('plan.listUpdated')}</span>}
        <Button variant="primary" disabled={pending} onClick={generate}>
          {t('plan.generate')}
        </Button>
      </div>

      {cost && cost.totalCents > 0 && (
        <p className="text-sm text-muted">
          {t('plan.cost', { total: formatMoney(cost.totalCents, currency) })}
          {cost.incompleteMeals > 0 && ` ${t('plan.cost.incomplete', { n: cost.incompleteMeals })}`}
        </p>
      )}

      <UseItUp />

      <AddMeal defaultDate={days.includes(today()) ? today() : start} />

      <WeekMatrix days={days} meals={meals} slots={slots} />
      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {days.map((day) => {
          const dayMeals = meals.filter((m) => m.date === day);
          const daySlots = slots.filter((slot) => slot.date === day);
          return (
            <section key={day} className={`rounded-xl border bg-surface p-3 ${day === today() ? 'border-accent' : 'border-line'}`}>
              <h2 className="mb-2 text-sm font-semibold first-letter:uppercase">{formatDay(day)}</h2>
              {dayMeals.length === 0 && daySlots.length === 0 ? (
                <p className="text-sm text-muted">{t('plan.nothing')}</p>
              ) : (
                <ul className="space-y-2">
                  {dayMeals.map((meal) => (
                    <li key={meal.id}>
                      <MealRow meal={meal} />
                    </li>
                  ))}
                  {daySlots.map((slot) => (
                    <li key={slot.mealType} className="rounded-lg border border-dashed border-line px-2 py-1 text-sm text-muted">
                      {t('plan.slot', { meal: t(`meal.${slot.mealType}`) })}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** Desktop week view: meals as rows, days as columns, today highlighted with the accent line. */
function WeekMatrix({ days, meals, slots }: { days: string[]; meals: PlannedMeal[]; slots: PlanSlot[] }) {
  const t = useT();
  // Breakfast and snack rows only appear when something is planned (or expected) in them.
  const rows = MEALS.filter((m) => ['lunch', 'dinner'].includes(m) || meals.some((x) => x.mealType === m) || slots.some((x) => x.mealType === m));
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
              <div className={`text-xs first-letter:uppercase ${isToday ? 'text-accent-soft' : 'text-muted'}`}>{fromIso(day).toLocaleDateString(locale(), { weekday: 'short' })}</div>
              <div className="text-xl leading-tight tabular-nums">{fromIso(day).getDate()}</div>
            </div>
          );
        })}
      </div>
      {rows.map((mealType) => (
        <div key={mealType} className={columns}>
          <div className="pt-3 text-xs text-muted">{t(`meal.${mealType}`)}</div>
          {days.map((day) => {
            const here = meals.filter((m) => m.date === day && m.mealType === mealType);
            const open = here.length === 0 && slots.some((x) => x.date === day && x.mealType === mealType);
            return (
              <div key={day} className={`min-h-24 space-y-1.5 rounded-lg p-1 ${day === today() ? 'bg-accent/10' : ''}`}>
                {here.map((meal) => (
                  <div key={meal.id} className="rounded-lg bg-surface px-2.5 py-2 shadow-[0_0_0_1px_var(--line)]">
                    <MealRow meal={meal} compact />
                  </div>
                ))}
                {open && <div className="rounded-lg border border-dashed border-line px-2.5 py-2 text-xs text-muted">{t('plan.slot', { meal: t(`meal.${mealType}`) })}</div>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MealRow({ meal, compact = false }: { meal: PlannedMeal; compact?: boolean }) {
  const t = useT();
  const { run, pending } = useAction();
  return (
    <div className="text-sm">
      <div className="text-xs text-muted">
        {compact ? t('common.servings', { n: meal.servings }) : `${t(`meal.${meal.mealType}`)} · ${t('common.servings', { n: meal.servings })}`}
      </div>
      <div className={`font-medium ${meal.cooked ? 'text-muted line-through' : ''}`}>
        {meal.recipeId ? (
          <a href={`#recipes/${meal.recipeId}`} className="hover:text-accent hover:underline">
            {meal.recipeName}
          </a>
        ) : (
          meal.title
        )}
      </div>
      <div className="mt-1 flex items-center gap-3">
        {meal.cooked ? (
          <Badge tone="accent">{t('plan.cooked')}</Badge>
        ) : (
          <button
            className="cursor-pointer text-xs text-accent hover:underline disabled:opacity-50"
            disabled={pending}
            title={t('plan.cookTitle')}
            onClick={() => run(() => api.post(`/plan/${meal.id}/cook`))}
          >
            {t('plan.cook')}
          </button>
        )}
        <button className="cursor-pointer text-xs text-muted hover:text-danger" onClick={() => run(() => api.del(`/plan/${meal.id}`))}>
          {t('plan.remove')}
        </button>
      </div>
    </div>
  );
}

function AddMeal({ defaultDate }: { defaultDate: string }) {
  const t = useT();
  const { data: recipes = [] } = useQuery({ queryKey: ['recipes', ''], queryFn: () => api.get<RecipeSummary[]>('/recipes') });
  const { run, pending } = useAction();
  const [form, setForm] = useState({ date: defaultDate, mealType: 'dinner' as MealType, recipeId: '', title: '', servings: '' });
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
    set({ title: '' });
  };

  return (
    <Card title={t('plan.add.title')}>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input type="date" required aria-label={t('plan.add.date')} value={form.date} onChange={(e) => set({ date: e.target.value })} />
        <Select aria-label={t('plan.add.meal')} value={form.mealType} onChange={(e) => set({ mealType: e.target.value as MealType })}>
          {MEALS.map((value) => (
            <option key={value} value={value}>
              {t(`meal.${value}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t('plan.add.recipe')} value={form.recipeId} onChange={(e) => set({ recipeId: e.target.value })} className="flex-1 basis-40">
          <option value="">{t('plan.add.freeText')}</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        {!form.recipeId && (
          <Input required placeholder={t('plan.add.titlePlaceholder')} aria-label={t('plan.add.titleAria')} value={form.title} onChange={(e) => set({ title: e.target.value })} className="flex-1 basis-40" />
        )}
        <Input type="number" min={1} placeholder={t('plan.add.servings')} aria-label={t('plan.add.servingsAria')} value={form.servings} onChange={(e) => set({ servings: e.target.value })} className="w-24" />
        <Button type="submit" variant="primary" disabled={pending}>
          {t('plan.add.submit')}
        </Button>
      </form>
    </Card>
  );
}

/** Recipes that would use up what is about to expire, so nothing gets thrown away. */
function UseItUp() {
  const t = useT();
  const { data } = useQuery({ queryKey: ['recipes', 'suggest'], queryFn: () => api.get<Suggestions>('/recipes/suggest?withinDays=5&limit=3') });
  if (!data || data.expiring.length === 0) return null;

  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">
        {t('plan.useUp.title')} <span className="font-normal text-muted">({data.expiring.map((e) => e.name).join(', ')})</span>
      </summary>
      {data.suggestions.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('plan.useUp.none')}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {data.suggestions.map((s) => (
            <li key={s.recipeId}>
              <span className="font-medium">{s.name}</span>
              <span className="text-muted">
                {' '}
                · {t('plan.useUp.uses', { names: s.usesExpiring.map((u) => u.name).join(', ') })} ·{' '}
                {s.canCook ? t('plan.useUp.ready') : t('plan.useUp.missing', { names: s.missing.map((m) => m.name).join(', ') })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
