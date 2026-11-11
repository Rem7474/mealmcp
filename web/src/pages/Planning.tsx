import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatDate, formatDay, formatMoney, MEALS, today, weekStart } from '../format';
import { useT } from '../i18n';
import type { MealType, PlanCost, PlannedMeal, RecipeSummary } from '../types';
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

      <AddMeal defaultDate={days.includes(today()) ? today() : start} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((day) => {
          const dayMeals = meals.filter((m) => m.date === day);
          return (
            <section key={day} className={`rounded-xl border bg-surface p-3 ${day === today() ? 'border-accent' : 'border-line'}`}>
              <h2 className="mb-2 text-sm font-semibold first-letter:uppercase">{formatDay(day)}</h2>
              {dayMeals.length === 0 ? (
                <p className="text-sm text-muted">{t('plan.nothing')}</p>
              ) : (
                <ul className="space-y-2">
                  {dayMeals.map((meal) => (
                    <MealRow key={meal.id} meal={meal} />
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

function MealRow({ meal }: { meal: PlannedMeal }) {
  const t = useT();
  const { run, pending } = useAction();
  return (
    <li className="text-sm">
      <div className="text-xs text-muted">
        {t(`meal.${meal.mealType}`)} · {t('common.servings', { n: meal.servings })}
      </div>
      <div className={`font-medium ${meal.cooked ? 'text-muted line-through' : ''}`}>{meal.recipeName ?? meal.title}</div>
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
    </li>
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
