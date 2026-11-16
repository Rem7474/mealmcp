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
    <main className="stagger mx-auto max-w-sm px-4 py-10">
      <div className="mb-2 flex justify-end">
        <LanguageSwitch />
      </div>
      <Harvest />
      <h1 className="text-5xl text-ink">
        Meal<span className="text-accent italic">MCP</span>
      </h1>
      <p className="mt-2 mb-7 max-w-xs text-muted text-pretty">{t('auth.tagline')}</p>
      <Card title={t(`auth.title.${mode}`)}>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <Input
              required
              autoComplete="name"
              placeholder={t('auth.name')}
              aria-label={t('auth.name')}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              className="w-full"
            />
          )}
          <Input
            required
            type="email"
            autoComplete="email"
            placeholder={t('auth.email')}
            aria-label={t('auth.email')}
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            className="w-full"
          />
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
                <Input
                  placeholder={t('auth.householdName')}
                  aria-label={t('auth.householdName')}
                  value={form.householdName}
                  onChange={(e) => set({ householdName: e.target.value })}
                  className="w-full"
                />
              )}
              <p className="text-sm text-muted">
                {joining ? t('auth.hint.join') : registrationOpen ? t('auth.hint.open') : t('auth.hint.closed')}
              </p>
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
          type="button"
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

/** A tomato, a lemon and a leaf, drawn with flat shapes: the only picture on the sign-in page. */
function Harvest() {
  return (
    <svg viewBox="0 0 220 96" aria-hidden="true" className="mb-4 h-20 w-auto">
      <circle cx="54" cy="52" r="38" fill="var(--accent)" />
      <circle cx="42" cy="40" r="9" fill="#fff" opacity=".18" />
      <path d="M54 14c-8-8-18-6-24 0 10 0 14 6 24 6s14-6 24-6c-6-6-16-8-24 0z" fill="var(--herb)" />
      <ellipse cx="128" cy="60" rx="34" ry="26" fill="var(--warn)" transform="rotate(-18 128 60)" />
      <ellipse cx="116" cy="52" rx="8" ry="5" fill="#fff" opacity=".22" transform="rotate(-18 116 52)" />
      <path d="M170 84c0-34 14-62 44-70-2 34-14 62-44 70z" fill="var(--herb)" opacity=".85" />
      <path d="M172 82c10-22 22-42 38-58" stroke="var(--bg)" strokeWidth="2" fill="none" />
    </svg>
  );
}

export const meKey = ['me'] as const;

/** After login/logout: drop cached household data (it may belong to someone else) and re-read who is logged in. */
export async function resetSession(queryClient: QueryClient) {
  // Anything the service worker kept goes too (a shared device must not hold on to the previous person's pages).
  navigator.serviceWorker?.controller?.postMessage('clear-caches');
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] });
  await queryClient.invalidateQueries({ queryKey: meKey });
}

export const fetchMe = () => api.get<Me>('/auth/me');
