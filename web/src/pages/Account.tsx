import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, useAction } from '../api';
import { formatDate, MEALS, weekdayName } from '../format';
import { useI18n, useT } from '../i18n';
import type { Equipment, Household, HouseholdSettings, MealTypeKey, TokenInfo, User } from '../types';
import { Badge, Button, Card, Empty, Input, Select } from '../ui';
import { resetSession } from './AuthPage';

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
      <HouseholdCard user={user} />
      <SettingsCard />
      <EquipmentCard />
      <Card title={t('account.connect.title')}>
        <p className="text-sm">{t('account.connect.address')}</p>
        <code className="mt-1 block rounded-lg border border-line px-3 py-2 text-sm break-all">{mcpUrl}</code>
        <p className="mt-2 text-sm text-muted">{rich('account.connect.help', { header: <code>Authorization: Bearer …</code> })}</p>
      </Card>
      <TokensCard />
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
    const next = days(meal).includes(weekday) ? days(meal).filter((d) => d !== weekday) : [...days(meal), weekday].sort();
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
    </Card>
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
                <input type="checkbox" className="size-4 accent-(--accent)" checked={item.owned} onChange={(e) => run(() => api.patch(`/equipment/${item.id}`, { owned: e.target.checked }))} />
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
