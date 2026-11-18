import { ArrowsClockwise, Check, CheckCircle, ShoppingCart, WarningCircle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatDay } from '../format';
import { useT } from '../i18n';
import type { AiStatus, MealType, RecipeSummary, WeekPlan, WeekPlanSlot } from '../types';
import { Button, Field, Select, Sheet } from '../ui';

const REASONS = {
  usesExpiring: 'week.reason.usesExpiring',
  canCook: 'week.reason.canCook',
  favorite: 'week.reason.favorite',
  inSeason: 'week.reason.inSeason',
  quick: 'week.reason.quick',
  aiDraft: 'week.reason.aiDraft',
  aiPick: 'week.reason.aiPick',
} as const;
const OFFERED: MealType[] = ['lunch', 'dinner'];

/**
 * "Plan my week": pick the meals to fill, review what the app proposes slot by slot (keep, another one, pick your own),
 * then write it to the plan. No model involved; nothing is written before the last step.
 */
export function WeekPlanner({ start, onClose }: { start: string; onClose: () => void }) {
  const t = useT();
  const { run, pending } = useAction();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(days.map((d) => `${d}|dinner`)));
  const [maxMinutes, setMaxMinutes] = useState('');
  const [wishes, setWishes] = useState('');
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [done, setDone] = useState<{ planned: number; skipped: number; diet: number; listed: boolean } | null>(null);
  // A plan left under review (closed the sheet, came back) resumes where it was.
  const { data: current } = useQuery({ queryKey: ['plan', 'week-current'], queryFn: () => api.get<WeekPlan | null>('/plan/week') });
  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', '', ''],
    queryFn: () => api.get<RecipeSummary[]>('/recipes?search=&tag='),
  });
  // Only offered when the household's AI server answers and has a model.
  const { data: ai } = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api.get<AiStatus>('/ai/status'), retry: false });
  const [reset, setReset] = useState(false);
  const shown = done || reset ? null : (plan ?? current ?? null);
  // While the assistant works through the slots, follow the plan until it is done.
  const generating = shown?.generating === true;
  const shownId = shown?.id;
  useEffect(() => {
    if (!generating || shownId === undefined) return;
    const timer = setInterval(() => {
      api
        .get<WeekPlan>(`/plan/week/${shownId}`)
        .then(setPlan)
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [generating, shownId]);

  const toggle = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const propose = async (withAi = false) => {
    setReset(false);
    const meals = [...chosen].map((k) => {
      const [date, mealType] = k.split('|');
      return { date, mealType };
    });
    const body = { meals, ...(maxMinutes ? { maxMinutes: Number(maxMinutes) } : {}) };
    const url = withAi ? '/plan/week/ai' : '/plan/week';
    setPlan((await run(() => api.post<WeekPlan>(url, withAi && wishes.trim() ? { ...body, wishes: wishes.trim() } : body))) as WeekPlan);
  };
  const act = async (path: string, body?: unknown) =>
    setPlan((await run(() => api.post<WeekPlan>(`/plan/week/${shown?.id}${path}`, body))) as WeekPlan);
  const slotPath = (s: WeekPlanSlot, verb: string) => `/slots/${encodeURIComponent(s.key)}/${verb}`;

  const apply = async () => {
    const result = (await run(() => api.post(`/plan/week/${shown?.id}/apply`))) as { planned: unknown[]; skipped: { reason: string }[] };
    setDone({
      planned: result.planned.length,
      skipped: result.skipped.filter((x) => x.reason !== 'dietConflict').length,
      diet: result.skipped.filter((x) => x.reason === 'dietConflict').length,
      listed: false,
    });
    setPlan(null);
  };
  const generate = async () => {
    await run(() => api.post('/shopping/generate', { from: start, to: addDays(start, 6) }));
    setDone((d) => d && { ...d, listed: true });
  };

  const accepted = shown?.slots.filter((s) => s.status === 'accepted').length ?? 0;
  const open = shown?.slots.filter((s) => s.status === 'proposed').length ?? 0;

  return (
    <Sheet title={t('week.title')} onClose={onClose}>
      {done ? (
        <div className="space-y-3 p-5 text-sm">
          <p className="flex items-center gap-2 text-base">
            <CheckCircle size={20} className="text-accent" />
            {t('week.done', { n: done.planned })}
          </p>
          {done.diet > 0 && <p className="text-muted">{t('week.skippedDiet', { n: done.diet })}</p>}
          {done.skipped > 0 && <p className="text-muted">{t('week.skipped', { n: done.skipped })}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {done.listed ? (
              <span className="text-accent">{t('plan.listUpdated')}</span>
            ) : (
              <Button variant="primary" disabled={pending} onClick={generate}>
                <ShoppingCart size={16} />
                {t('plan.generate')}
              </Button>
            )}
            <Button onClick={onClose}>{t('app.close')}</Button>
          </div>
        </div>
      ) : !shown ? (
        <div className="space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-muted">{t('week.intro')}</p>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('week.which')}</legend>
            {days.map((day) => (
              <div key={day} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-36 text-sm first-letter:uppercase">{formatDay(day)}</span>
                {OFFERED.map((m) => (
                  <label key={m} className="flex min-h-11 items-center gap-1.5 text-sm sm:min-h-0">
                    <input type="checkbox" checked={chosen.has(`${day}|${m}`)} onChange={() => toggle(`${day}|${m}`)} />
                    <span>
                      <span className="sr-only">{formatDay(day)} · </span>
                      {t(`meal.${m}`)}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
          <Field label={t('week.maxMinutes')}>
            <Select value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)}>
              <option value="">{t('week.anyTime')}</option>
              {[20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {t('common.minutes', { n })}
                </option>
              ))}
            </Select>
          </Field>
          {ai?.text && (
            <Field label={t('week.wishes')} hint={t('week.wishesHint')}>
              <textarea
                className="min-h-16 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                maxLength={500}
                value={wishes}
                onChange={(e) => setWishes(e.target.value)}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending || chosen.size === 0} onClick={() => propose(false)}>
              {t('week.propose')}
            </Button>
            {ai?.text && (
              <Button disabled={pending || chosen.size === 0 || chosen.size > 14} onClick={() => propose(true)}>
                {t('week.ai')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {shown.source === 'llm' && <p className="px-5 pt-4 text-xs text-muted">{t('week.aiNote')}</p>}
          <ul className="space-y-3 overflow-y-auto p-5">
            {shown.slots.map((slot) => {
              const why = slot.recipe
                ? [
                    ...slot.recipe.reasons.map((r) => t(REASONS[r as keyof typeof REASONS] ?? 'week.reason.canCook')),
                    ...(slot.recipe.missing.length ? [t('week.toBuy', { names: slot.recipe.missing.join(', ') })] : []),
                  ]
                : [];
              return (
                <li key={slot.key} className="rounded-lg border border-line p-3 text-sm">
                  <div className="text-xs tracking-wider text-muted uppercase">
                    {formatDay(slot.date)} · {t(`meal.${slot.mealType}`)}
                  </div>
                  {slot.recipe ? (
                    <>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                        {slot.recipe.id === null ? (
                          <span className="text-base font-medium">{slot.recipe.name}</span>
                        ) : (
                          <a href={`#recipes/${slot.recipe.id}`} className="text-base font-medium hover:text-accent hover:underline">
                            {slot.recipe.name}
                          </a>
                        )}
                        {slot.status === 'accepted' && (
                          <span className="inline-flex items-center gap-1 text-accent">
                            <Check size={14} />
                            {t('week.accepted')}
                          </span>
                        )}
                      </div>
                      {why.length > 0 && <p className="mt-1 text-muted">{why.join(' · ')}</p>}
                      {slot.recipe.draft && (
                        <details className="mt-1 text-muted">
                          <summary className="cursor-pointer">{slot.recipe.draft.ingredients.map((i) => i.name).join(', ')}</summary>
                          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                            {slot.recipe.draft.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </details>
                      )}
                      {slot.recipe.draft?.ingredients.some((i) => i.isNew) && (
                        <p className="mt-1 text-muted">
                          {t('week.newIngredients', {
                            names: slot.recipe.draft.ingredients
                              .filter((i) => i.isNew)
                              .map((i) => i.name)
                              .join(', '),
                          })}
                        </p>
                      )}
                    </>
                  ) : slot.thinking ? (
                    <p className="mt-1 text-muted">{t('week.thinking')}</p>
                  ) : (
                    <p className="mt-1 flex items-center gap-1.5 text-muted">
                      <WarningCircle size={14} />
                      {t('week.noneLeft')}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {slot.thinking && slot.recipe && <span className="text-xs text-muted">{t('week.thinking')}</span>}
                    {slot.recipe && slot.status === 'proposed' && (
                      <Button compact variant="primary" disabled={pending} onClick={() => act(slotPath(slot, 'accept'))}>
                        {t('week.accept')}
                      </Button>
                    )}
                    {slot.recipe && (
                      <Button compact disabled={pending} onClick={() => act(slotPath(slot, 'refuse'))}>
                        <ArrowsClockwise size={14} />
                        {t('week.another')}
                      </Button>
                    )}
                    <Select
                      aria-label={t('week.pick', { day: formatDay(slot.date), meal: t(`meal.${slot.mealType}`) })}
                      className="h-10 w-auto max-w-48 sm:h-8"
                      value=""
                      onChange={(e) => e.target.value && act(slotPath(slot, 'choose'), { recipeId: Number(e.target.value) })}
                    >
                      <option value="">{t('week.pickOwn')}</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <Button
              variant="ghost"
              onClick={() => {
                setPlan(null);
                setReset(true);
              }}
            >
              {t('week.reset')}
            </Button>
            <Button disabled={pending || open === 0} onClick={() => act('/accept-all')}>
              {t('week.acceptAll')}
            </Button>
            <Button variant="primary" disabled={pending || accepted === 0} onClick={apply}>
              {t('week.apply', { n: accepted })}
            </Button>
          </footer>
        </>
      )}
    </Sheet>
  );
}
