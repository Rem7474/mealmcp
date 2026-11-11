import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from '@phosphor-icons/react';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { formatDate, MEALS, weekdayName } from '../format';
import { type MessageKey, useI18n, useT } from '../i18n';
import { ALLERGENS, COUNTRIES, type Country, DIETS, type Equipment, type Household, type HouseholdSettings, type MealTypeKey, type Product, type TokenInfo, type User } from '../types';
import { Badge, Button, Card, Empty, Fold, Input, Select } from '../ui';
import { resetSession } from './AuthPage';
import { useProducts } from './shared';

const day = (ms: number) => formatDate(new Date(ms).toISOString().slice(0, 10));

export function Account({ user }: { user: User }) {
  const { t, rich } = useI18n();
  const queryClient = useQueryClient();
  const mcpUrl = `${location.origin}/mcp`;

  const logout = async () => {
    await api.post('/auth/logout');
    await resetSession(queryClient);
  };

  return (
    <>
      <Card title={user.name} actions={<Button onClick={logout}>{t('account.signOut')}</Button>}>
        <p className="text-sm text-muted">
          {t('account.roleLine', { email: user.email, role: t(`role.${user.role}`), household: user.householdName })}
        </p>
      </Card>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <HouseholdCard user={user} />
          <Fold title={t('settings.title')}>
            <SettingsCard />
          </Fold>
          <Fold title={t('equipment.title')}>
            <EquipmentCard />
          </Fold>
        </div>
        <div className="min-w-0 space-y-4">
          <Fold title={t('account.connect.title')}>
            <Card>
              <p className="text-sm">{t('account.connect.address')}</p>
              <code className="mt-1 block rounded-lg border border-line px-3 py-2 text-sm break-all">{mcpUrl}</code>
              <p className="mt-2 text-sm text-muted">{rich('account.connect.help', { header: <code>Authorization: Bearer …</code> })}</p>
            </Card>
          </Fold>
          <Fold title={t('tokens.title')}>
            <TokensCard />
          </Fold>
          <Fold title={t('products.title')}>
            <ProductsCard />
          </Fold>
        </div>
      </div>
    </>
  );
}

function HouseholdCard({ user }: { user: User }) {
  const { t, rich } = useI18n();
  const { data: household } = useQuery({ queryKey: ['household'], queryFn: () => api.get<Household>('/household') });
  const { run, pending } = useAction();
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);

  const createInvite = async () => setInvite((await run(() => api.post('/household/invites'))) as { code: string; expiresAt: number });

  return (
    <Card title={t('household.title')} actions={user.role === 'owner' && <Button disabled={pending} onClick={createInvite}>{t('household.invite')}</Button>}>
      <ul className="divide-y divide-line text-sm">
        {household?.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              {m.name} <span className="text-muted">{m.email}</span>
            </span>
            {m.role === 'owner' && <Badge tone="accent">{t('role.owner')}</Badge>}
          </li>
        ))}
      </ul>
      {invite && (
        <div className="mt-3 rounded-lg border border-accent p-3 text-sm">
          <p>{rich('household.inviteCode', { code: <code className="text-base font-semibold select-all">{invite.code}</code> })}</p>
          <p className="mt-1 text-muted">{t('household.inviteHelp', { date: day(invite.expiresAt) })}</p>
        </div>
      )}
    </Card>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first; 0 = Sunday

/** Default servings and which meals are planned on which days. */
function SettingsCard() {
  const t = useT();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<HouseholdSettings>('/settings') });
  const { run, pending } = useAction();
  const [draft, setDraft] = useState<HouseholdSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const current = draft ?? data;
  if (!current) return null;

  const days = (meal: MealTypeKey) => current.plannedMeals?.[meal] ?? [];
  const change = (next: HouseholdSettings) => {
    setDraft(next);
    setSaved(false);
  };
  const toggle = (meal: MealTypeKey, weekday: number) => {
    const next = days(meal).includes(weekday) ? days(meal).filter((d) => d !== weekday) : [...days(meal), weekday].sort((a, b) => a - b);
    change({ ...current, plannedMeals: { ...current.plannedMeals, [meal]: next } });
  };
  const save = async () => {
    await run(() => api.put('/settings', current));
    setDraft(null);
    setSaved(true);
  };

  return (
    <Card title={t('settings.title')} actions={<Button variant="primary" disabled={pending || !draft} onClick={save}>{saved ? t('settings.saved') : t('settings.save')}</Button>}>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t('settings.servings')}
        <Input type="number" min={1} value={current.defaultServings ?? ''} onChange={(e) => change({ ...current, defaultServings: e.target.value ? Number(e.target.value) : undefined })} className="w-20" />
      </label>
      <p className="mt-1 text-sm text-muted">{t('settings.servingsHelp')}</p>
      <h3 className="mt-4 text-sm font-semibold">{t('settings.meals')}</h3>
      <p className="text-sm text-muted">{t('settings.mealsHelp')}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th />
              {WEEK.map((d) => (
                <th key={d} className="px-2 font-normal text-muted">
                  {weekdayName(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEALS.map((meal) => (
              <tr key={meal}>
                <th className="pr-3 text-left font-normal">{t(`meal.${meal}`)}</th>
                {WEEK.map((d) => (
                  <td key={d} className="text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-(--accent)"
                      aria-label={`${t(`meal.${meal}`)} ${weekdayName(d)}`}
                      checked={days(meal).includes(d)}
                      onChange={() => toggle(meal, d)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-4 text-sm font-semibold">{t('settings.location')}</h3>
      <p className="text-sm text-muted">{t('settings.locationHelp')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          {t('settings.country')}
          <Select value={current.country ?? 'FR'} onChange={(e) => change({ ...current, country: e.target.value as Country })}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {t(`country.${c}` as MessageKey)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-(--accent)" checked={current.hemisphere === 'south'} onChange={(e) => change({ ...current, hemisphere: e.target.checked ? 'south' : 'north' })} />
          {t('settings.southern')}
        </label>
      </div>
      <h3 className="mt-4 text-sm font-semibold">{t('settings.diet')}</h3>
      <p className="text-sm text-muted">{t('settings.dietHelp')}</p>
      <ChipPicker label={t('settings.diets')} options={DIETS.map((d) => ({ value: d, label: t(`diet.${d}` as MessageKey) }))} value={current.diet?.diets ?? []} onChange={(diets) => change({ ...current, diet: { ...current.diet, diets } })} />
      <ChipPicker label={t('settings.allergens')} options={ALLERGENS.map((a) => ({ value: a, label: t(`allergen.${a}` as MessageKey) }))} value={current.diet?.allergens ?? []} onChange={(allergens) => change({ ...current, diet: { ...current.diet, allergens } })} />
      <label className="mt-3 block text-sm">
        {t('settings.avoid')}
        <Input
          key={(current.diet?.avoid ?? []).join(',')}
          defaultValue={(current.diet?.avoid ?? []).join(', ')}
          placeholder={t('settings.avoidHelp')}
          onBlur={(e) => change({ ...current, diet: { ...current.diet, avoid: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } })}
          className="mt-1 w-full"
        />
      </label>
      <h3 className="mt-4 text-sm font-semibold">{t('settings.nutrition')}</h3>
      <p className="text-sm text-muted">{t('settings.nutritionHelp')}</p>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-(--accent)" checked={!!current.nutrition?.enabled} onChange={(e) => change({ ...current, nutrition: { enabled: e.target.checked } })} />
        {t('settings.nutritionOn')}
      </label>
      {draft && (
        <div role="status" className="sticky bottom-20 z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent bg-surface p-3 text-sm shadow-lg sm:bottom-4">
          <span className="font-medium">{t('settings.unsaved')}</span>
          <span className="flex gap-2">
            <Button onClick={() => setDraft(null)}>{t('settings.discard')}</Button>
            <Button variant="primary" disabled={pending} onClick={save}>
              {t('settings.save')}
            </Button>
          </span>
        </div>
      )}
    </Card>
  );
}

/** A group of toggle chips: several options can be on at once. */
function ChipPicker({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <fieldset className="mt-3 min-w-0">
      <legend className="mb-1 text-sm">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <Button key={o.value} type="button" variant={on ? 'primary' : 'secondary'} className="h-8 px-3" aria-pressed={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
              {o.label}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Appliances and utensils the household owns. Recipes list what they need and get flagged when something is missing. */
function EquipmentCard() {
  const t = useT();
  const { data: items = [] } = useQuery({ queryKey: ['equipment'], queryFn: () => api.get<Equipment[]>('/equipment') });
  const { run, pending } = useAction();
  const [form, setForm] = useState({ name: '', kind: 'appliance' as Equipment['kind'] });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    await run(() => api.post('/equipment', { name: form.name, kind: form.kind, owned: true }));
    setForm({ ...form, name: '' });
  };

  return (
    <Card title={t('equipment.title')}>
      <p className="mb-3 text-sm text-muted">{t('equipment.help')}</p>
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <Input required placeholder={t('equipment.name')} aria-label={t('equipment.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 basis-48" />
        <Select aria-label={t('equipment.appliance')} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Equipment['kind'] })}>
          <option value="appliance">{t('equipment.appliance')}</option>
          <option value="utensil">{t('equipment.utensil')}</option>
        </Select>
        <Button type="submit" disabled={pending}>
          {t('equipment.add')}
        </Button>
      </form>
      {items.length === 0 ? (
        <Empty>{t('equipment.empty')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              <Badge>{t(`equipment.${item.kind}`)}</Badge>
              <label className="flex items-center gap-1">
                <input type="checkbox" className="size-4 accent-(--accent)" checked={item.owned} onChange={() => run(() => api.patch(`/equipment/${item.id}`, { owned: !item.owned }))} />
                {t('equipment.owned')}
              </label>
              <Button variant="ghost" className="h-8 px-2" aria-label={t('equipment.remove', { name: item.name })} onClick={() => run(() => api.del(`/equipment/${item.id}`))}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TokensCard() {
  const { t } = useI18n();
  const { data: tokens = [] } = useQuery({ queryKey: ['tokens'], queryFn: () => api.get<TokenInfo[]>('/tokens') });
  const { run, pending } = useAction();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { token } = (await run(() => api.post('/tokens', { name }))) as { token: string };
    setCreated(token);
    setName('');
  };

  return (
    <Card title={t('tokens.title')}>
      <form onSubmit={create} className="mb-3 flex flex-wrap gap-2">
        <Input required placeholder={t('tokens.namePlaceholder')} aria-label={t('tokens.nameAria')} value={name} onChange={(e) => setName(e.target.value)} className="flex-1 basis-48" />
        <Button type="submit" disabled={pending}>
          {t('tokens.create')}
        </Button>
      </form>
      {created && (
        <div className="mb-3 rounded-lg border border-accent p-3 text-sm">
          <p>{t('tokens.copy')}</p>
          <code className="mt-1 block text-base break-all select-all">{created}</code>
        </div>
      )}
      {tokens.length === 0 ? (
        <Empty>{t('tokens.empty')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{token.name ?? t('tokens.oauthApp')}</div>
                <div className="text-muted">
                  {t('tokens.meta', {
                    created: day(token.createdAt),
                    usage: token.lastUsedAt ? t('tokens.lastUsed', { date: day(token.lastUsedAt) }) : t('tokens.neverUsed'),
                  })}
                </div>
              </div>
              <Button variant="danger" onClick={() => run(() => api.del(`/tokens/${token.id}`))}>
                {t('tokens.revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const AISLES = ['produce', 'dairy', 'meat_fish', 'bakery', 'pantry', 'frozen', 'drinks', 'household', 'other'];
const PRODUCT_LIMIT = 100;

/** Every known product: file it under a store aisle and teach it other names (receipt wording, brands). */
function ProductsCard() {
  const t = useT();
  const { data: products = [] } = useProducts();
  const { run } = useAction();
  const [search, setSearch] = useState('');
  const matches = products.filter((p) => {
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.aliases.some((a) => a.toLowerCase().includes(q));
  });

  return (
    <Card title={t('products.title')}>
      <p className="mb-3 text-sm text-muted">{t('products.help')}</p>
      <Input type="search" placeholder={t('products.search')} aria-label={t('products.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 w-full" />
      {matches.length === 0 ? (
        <Empty>{t('products.none')}</Empty>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto overscroll-contain text-sm">
          {matches.slice(0, PRODUCT_LIMIT).map((p) => (
            <ProductRow key={p.id} product={p} run={run} />
          ))}
        </ul>
      )}
      {matches.length > PRODUCT_LIMIT && <p className="mt-2 text-xs text-muted">{t('products.more', { n: PRODUCT_LIMIT })}</p>}
    </Card>
  );
}

function ProductRow({ product: p, run }: { product: Product; run: (fn: () => Promise<unknown>) => Promise<unknown> }) {
  const t = useT();
  const [alias, setAlias] = useState('');
  const aisle = p.category ?? p.suggestedCategory ?? '';
  const addAlias = async (e: FormEvent) => {
    e.preventDefault();
    if (!alias.trim()) return;
    await run(() => api.post('/products/alias', { name: p.name, alias: alias.trim() }));
    setAlias('');
  };

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
        {p.isStaple && <Badge>{t('products.staple')}</Badge>}
        <Select aria-label={t('products.aisle')} value={aisle} onChange={(e) => run(() => api.patch(`/products/${p.id}`, { category: e.target.value || null }))} className="h-8 w-40 px-2 text-xs">
          <option value="">{t('aisle.none')}</option>
          {AISLES.map((c) => (
            <option key={c} value={c}>
              {t(`aisle.${c}` as MessageKey)}
            </option>
          ))}
          {aisle && !AISLES.includes(aisle) && <option value={aisle}>{aisle}</option>}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">{t('products.aliases')}:</span>
        {p.aliases.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-md bg-ink/5 py-0.5 pr-1 pl-2 text-xs">
            {a}
            <button type="button" aria-label={t('products.removeAlias', { alias: a })} className="cursor-pointer rounded p-0.5 text-muted hover:text-ink" onClick={() => run(() => api.del(`/products/alias?alias=${encodeURIComponent(a)}`))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <form onSubmit={addAlias}>
          <Input placeholder={t('products.addAlias')} aria-label={t('products.addAlias')} value={alias} onChange={(e) => setAlias(e.target.value)} className="h-7 w-36 px-2 text-xs" />
        </form>
      </div>
    </li>
  );
}
