import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { addDays, formatDate, formatDay, MEAL_LABELS, today, weekStart } from '../format';
import type { MealType, PlannedMeal, RecipeSummary } from '../types';
import { Badge, Button, Card, Input, Select } from '../ui';

export function Planning() {
  const [start, setStart] = useState(() => weekStart(today()));
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const { data: meals = [] } = useQuery({
    queryKey: ['plan', start],
    queryFn: () => api.get<PlannedMeal[]>(`/plan?from=${start}&to=${end}`),
  });
  const { run, pending } = useAction();
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    await run(() => api.post('/shopping/generate', { from: start, to: end }));
    setGenerated(true);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button aria-label="Semaine précédente" onClick={() => setStart(addDays(start, -7))}>
          ←
        </Button>
        <Button aria-label="Semaine suivante" onClick={() => setStart(addDays(start, 7))}>
          →
        </Button>
        <Button variant="ghost" onClick={() => setStart(weekStart(today()))}>
          Cette semaine
        </Button>
        <span className="font-semibold">
          {formatDate(start)} – {formatDate(end)}
        </span>
        <span className="flex-1" />
        {generated && <span className="text-sm text-accent">Liste mise à jour, voir l’onglet Courses.</span>}
        <Button variant="primary" disabled={pending} onClick={generate}>
          Générer la liste de courses
        </Button>
      </div>

      <AddMeal defaultDate={days.includes(today()) ? today() : start} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((day) => {
          const dayMeals = meals.filter((m) => m.date === day);
          return (
            <section key={day} className={`rounded-xl border bg-surface p-3 ${day === today() ? 'border-accent' : 'border-line'}`}>
              <h2 className="mb-2 text-sm font-semibold capitalize">{formatDay(day)}</h2>
              {dayMeals.length === 0 ? (
                <p className="text-sm text-muted">Rien de prévu</p>
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
  const { run, pending } = useAction();
  return (
    <li className="text-sm">
      <div className="text-xs text-muted">
        {MEAL_LABELS[meal.mealType]} · {meal.servings} pers.
      </div>
      <div className={`font-medium ${meal.cooked ? 'text-muted line-through' : ''}`}>{meal.recipeName ?? meal.title}</div>
      <div className="mt-1 flex items-center gap-3">
        {meal.cooked ? (
          <Badge tone="accent">cuisiné</Badge>
        ) : (
          <button
            className="cursor-pointer text-xs text-accent hover:underline disabled:opacity-50"
            disabled={pending}
            title="Marque le repas comme cuisiné et retire les ingrédients du stock"
            onClick={() => run(() => api.post(`/plan/${meal.id}/cook`))}
          >
            Cuisiné
          </button>
        )}
        <button className="cursor-pointer text-xs text-muted hover:text-danger" onClick={() => run(() => api.del(`/plan/${meal.id}`))}>
          Retirer
        </button>
      </div>
    </li>
  );
}

function AddMeal({ defaultDate }: { defaultDate: string }) {
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
    <Card title="Planifier un repas">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input type="date" required aria-label="Date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        <Select aria-label="Repas" value={form.mealType} onChange={(e) => set({ mealType: e.target.value as MealType })}>
          {Object.entries(MEAL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label="Recette" value={form.recipeId} onChange={(e) => set({ recipeId: e.target.value })} className="flex-1 basis-40">
          <option value="">Texte libre…</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        {!form.recipeId && (
          <Input required placeholder="ex. Restaurant, restes…" aria-label="Intitulé" value={form.title} onChange={(e) => set({ title: e.target.value })} className="flex-1 basis-40" />
        )}
        <Input type="number" min={1} placeholder="Pers." aria-label="Nombre de personnes" value={form.servings} onChange={(e) => set({ servings: e.target.value })} className="w-20" />
        <Button type="submit" variant="primary" disabled={pending}>
          Planifier
        </Button>
      </form>
    </Card>
  );
}
