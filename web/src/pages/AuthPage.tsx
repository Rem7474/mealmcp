import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import { LanguageSwitch, localizeError, useT } from '../i18n';
import type { Me } from '../types';
import { Button, Card, Input } from '../ui';

/** Login and sign-up. Sign-up needs an invite code unless the server allows open registration. */
export function AuthPage({ registrationOpen }: { registrationOpen: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', name: '', password: '', inviteCode: '', householdName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const joining = form.inviteCode.trim() !== '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await api.post('/auth/login', { email: form.email, password: form.password });
      else
        await api.post('/auth/register', {
          email: form.email,
          name: form.name,
          password: form.password,
          inviteCode: form.inviteCode.trim() || undefined,
          // The default household name is generated here so it is in the user's language.
          householdName: joining ? undefined : form.householdName.trim() || t('auth.defaultHousehold', { name: form.name.trim() }),
        });
      await resetSession(queryClient);
    } catch (err) {
      setError(localizeError(t, err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-accent">MealMCP</h1>
        <LanguageSwitch />
      </div>
      <Card title={t(`auth.title.${mode}`)}>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <Input required autoComplete="name" placeholder={t('auth.name')} aria-label={t('auth.name')} value={form.name} onChange={(e) => set({ name: e.target.value })} className="w-full" />
          )}
          <Input required type="email" autoComplete="email" placeholder={t('auth.email')} aria-label={t('auth.email')} value={form.email} onChange={(e) => set({ email: e.target.value })} className="w-full" />
          <Input
            required
            type="password"
            minLength={mode === 'register' ? 10 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? t('auth.passwordNew') : t('auth.password')}
            aria-label={t('auth.password')}
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
            className="w-full"
          />
          {mode === 'register' && (
            <>
              <Input
                required={!registrationOpen}
                placeholder={registrationOpen ? t('auth.inviteOptional') : t('auth.invite')}
                aria-label={t('auth.invite')}
                value={form.inviteCode}
                onChange={(e) => set({ inviteCode: e.target.value })}
                className="w-full"
              />
              {registrationOpen && !joining && (
                <Input placeholder={t('auth.householdName')} aria-label={t('auth.householdName')} value={form.householdName} onChange={(e) => set({ householdName: e.target.value })} className="w-full" />
              )}
              <p className="text-sm text-muted">{joining ? t('auth.hint.join') : registrationOpen ? t('auth.hint.open') : t('auth.hint.closed')}</p>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {t(`auth.submit.${mode}`)}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
        <button
          className="cursor-pointer text-accent underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
        </button>
      </p>
    </main>
  );
}

export const meKey = ['me'] as const;

/** After login/logout: drop cached household data (it may belong to someone else) and re-read who is logged in. */
export async function resetSession(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] });
  await queryClient.invalidateQueries({ queryKey: meKey });
}

export const fetchMe = () => api.get<Me>('/auth/me');
