import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { formatQty } from '../format';
import type { Availability, Recipe, RecipeSummary } from '../types';
import { Badge, Button, Card, Empty, Input } from '../ui';
import { parseQty, ProductDatalist } from './shared';

type View = { mode: 'list' } | { mode: 'detail'; id: number } | { mode: 'edit'; recipe?: Recipe };

export function Recipes() {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [search, setSearch] = useState('');
  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes', search],
    queryFn: () => api.get<RecipeSummary[]>(`/recipes?search=${encodeURIComponent(search)}`),
  });

  if (view.mode === 'edit')
    return <RecipeForm recipe={view.recipe} onDone={(id) => setView(id ? { mode: 'detail', id } : { mode: 'list' })} />;
  if (view.mode === 'detail')
    return <RecipeDetail id={view.id} onBack={() => setView({ mode: 'list' })} onEdit={(recipe) => setView({ mode: 'edit', recipe })} />;

  return (
    <>
      <div className="flex gap-2">
        <Input type="search" placeholder="Rechercher une recette ou un ingrédient" aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
        <Button variant="primary" onClick={() => setView({ mode: 'edit' })}>
          Nouvelle recette
        </Button>
      </div>
      {recipes.length === 0 ? (
        <Empty>{search ? 'Aucune recette ne correspond.' : 'Aucune recette pour l’instant.'}</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setView({ mode: 'detail', id: r.id })}
                className="h-full w-full cursor-pointer rounded-xl border border-line bg-surface p-4 text-left hover:border-accent"
              >
                <div className="font-semibold">{r.name}</div>
                <div className="mt-1 text-sm text-muted">
                  {r.servings} pers. · {r.ingredientCount} ingrédient{r.ingredientCount > 1 ? 's' : ''}
                  {r.prepMinutes ? ` · ${r.prepMinutes} min` : ''}
                </div>
                {r.description && <p className="mt-2 line-clamp-2 text-sm">{r.description}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RecipeDetail({ id, onBack, onEdit }: { id: number; onBack: () => void; onEdit: (recipe: Recipe) => void }) {
  const { data: recipe } = useQuery({ queryKey: ['recipe', id], queryFn: () => api.get<Recipe>(`/recipes/${id}`) });
  const { data: availability } = useQuery({
    queryKey: ['recipe', id, 'availability'],
    queryFn: () => api.get<Availability>(`/recipes/${id}/availability`),
  });
  const { run, pending } = useAction();
  if (!recipe) return null;

  const remove = async () => {
    if (!confirm(`Supprimer « ${recipe.name} » ? Les repas planifiés avec cette recette seront aussi retirés.`)) return;
    await run(() => api.del(`/recipes/${id}`));
    onBack();
  };

  return (
    <>
      <Button variant="ghost" className="px-0" onClick={onBack}>
        ← Recettes
      </Button>
      <Card
        title={<span className="text-xl">{recipe.name}</span>}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => onEdit(recipe)}>Modifier</Button>
            <Button variant="danger" disabled={pending} onClick={remove}>
              Supprimer
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          {recipe.servings} personnes{recipe.prepMinutes ? ` · ${recipe.prepMinutes} min` : ''}
        </p>
        {recipe.description && <p className="mt-2">{recipe.description}</p>}

        <h3 className="mt-4 mb-2 flex items-center gap-2 font-semibold">
          Ingrédients
          {availability && (availability.canCook ? <Badge tone="accent">tout est en stock</Badge> : <Badge tone="warn">il manque des ingrédients</Badge>)}
        </h3>
        <ul className="divide-y divide-line text-sm">
          {recipe.ingredients.map((ing, i) => {
            const missing = availability?.ingredients[i]?.missing ?? 0;
            return (
              <li key={ing.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                <span className="w-20 text-right text-muted">{formatQty(ing.quantity, ing.unit)}</span>
                <span className="font-medium">{ing.name}</span>
                {ing.note && <span className="text-muted">({ing.note})</span>}
                {missing > 0 && <span className="text-warn">manque {formatQty(missing, ing.unit)}</span>}
              </li>
            );
          })}
        </ul>

        {recipe.instructions && (
          <>
            <h3 className="mt-4 mb-2 font-semibold">Préparation</h3>
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
}
const emptyRow = (): Row => ({ name: '', quantity: '', unit: '', note: '' });

function RecipeForm({ recipe, onDone }: { recipe?: Recipe; onDone: (id?: number) => void }) {
  const { run, pending } = useAction();
  const [form, setForm] = useState({
    name: recipe?.name ?? '',
    description: recipe?.description ?? '',
    servings: String(recipe?.servings ?? 4),
    prepMinutes: recipe?.prepMinutes != null ? String(recipe.prepMinutes) : '',
    instructions: recipe?.instructions ?? '',
  });
  const [rows, setRows] = useState<Row[]>(
    recipe?.ingredients.map((i) => ({ name: i.name, quantity: String(i.quantity), unit: i.unit === 'pièce' ? '' : i.unit, note: i.note ?? '' })) ?? [
      emptyRow(),
    ],
  );
  const setRow = (index: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description || null,
      servings: Number(form.servings),
      prepMinutes: form.prepMinutes ? Number(form.prepMinutes) : null,
      instructions: form.instructions || null,
      ingredients: rows
        .filter((r) => r.name.trim())
        .map((r) => ({ name: r.name, quantity: parseQty(r.quantity) ?? 1, unit: r.unit || undefined, note: r.note || null })),
    };
    const saved = (await run(() => (recipe ? api.patch<Recipe>(`/recipes/${recipe.id}`, body) : api.post<Recipe>('/recipes', body)))) as Recipe;
    onDone(saved.id);
  };

  return (
    <Card title={recipe ? 'Modifier la recette' : 'Nouvelle recette'}>
      <ProductDatalist />
      <form onSubmit={submit} className="space-y-3">
        <Input required placeholder="Nom de la recette" aria-label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" />
        <Input placeholder="Description courte (facultatif)" aria-label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full" />
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            Personnes
            <Input type="number" min={1} required value={form.servings} onChange={(e) => setForm({ ...form, servings: e.target.value })} className="w-20" />
          </label>
          <label className="flex items-center gap-2">
            Temps (min)
            <Input type="number" min={0} value={form.prepMinutes} onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })} className="w-20" />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">Ingrédients</legend>
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <Input inputMode="decimal" placeholder="Qté" aria-label="Quantité" value={row.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} className="w-20" />
              <Input list="unit-names" placeholder="Unité" aria-label="Unité" value={row.unit} onChange={(e) => setRow(i, { unit: e.target.value })} className="w-24" />
              <Input list="product-names" placeholder="Ingrédient" aria-label="Ingrédient" value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} className="flex-1 basis-32" />
              <Input placeholder="Note" aria-label="Note" value={row.note} onChange={(e) => setRow(i, { note: e.target.value })} className="flex-1 basis-24" />
              <Button variant="ghost" className="px-2" aria-label="Retirer l’ingrédient" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ))}
          <Button onClick={() => setRows([...rows, emptyRow()])}>+ Ingrédient</Button>
        </fieldset>

        <textarea
          placeholder="Préparation"
          aria-label="Préparation"
          rows={8}
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          className="w-full rounded-lg border border-line bg-surface p-3 text-sm focus:outline-2 focus:outline-accent"
        />

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            Enregistrer
          </Button>
          <Button onClick={() => onDone(recipe?.id)}>Annuler</Button>
        </div>
      </form>
    </Card>
  );
}
