import { Bread, Carrot, CookingPot, Egg, Fish, Leaf, Pepper } from '@phosphor-icons/react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../api';
import { LanguageSwitch, localizeError, useT } from '../i18n';
import type { Me } from '../types';
import { Button, Input } from '../ui';

const big = 'h-12 w-full rounded-xl px-4 text-base';

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
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side: the garden, big. On phones it is a short banner above the form. */}
      <section className="relative flex flex-col justify-between overflow-hidden px-6 pt-8 pb-6 lg:px-14 lg:py-12">
        <div className="relative flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-muted">
            <CookingPot size={20} weight="duotone" className="text-accent" />
            MealMCP
          </span>
          <span className="lg:hidden">
            <LanguageSwitch />
          </span>
        </div>
        <div className="stagger relative mt-8 lg:mt-0">
          <Harvest />
          <h1 className="text-6xl leading-[0.95] text-ink lg:text-8xl">
            Meal<span className="text-accent">MCP</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted text-pretty lg:mt-6 lg:text-xl">{t('auth.tagline')}</p>
        </div>
        <div className="max-lg:hidden" />
      </section>
      <section className="flex flex-col justify-center px-6 pb-12 lg:bg-surface lg:px-16 lg:py-12 lg:shadow-[inset_1px_0_0_var(--line)]">
        <div className="mb-6 flex justify-end max-lg:hidden">
          <LanguageSwitch />
        </div>
        <div className="stagger mx-auto w-full max-w-sm">
          <h2 className="mb-6 text-3xl">{t(`auth.title.${mode}`)}</h2>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <Input
                required
                autoComplete="name"
                placeholder={t('auth.name')}
                aria-label={t('auth.name')}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                className={big}
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
              className={big}
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
              className={big}
            />
            {mode === 'register' && (
              <>
                <Input
                  required={!registrationOpen}
                  placeholder={registrationOpen ? t('auth.inviteOptional') : t('auth.invite')}
                  aria-label={t('auth.invite')}
                  value={form.inviteCode}
                  onChange={(e) => set({ inviteCode: e.target.value })}
                  className={big}
                />
                {registrationOpen && !joining && (
                  <Input
                    placeholder={t('auth.householdName')}
                    aria-label={t('auth.householdName')}
                    value={form.householdName}
                    onChange={(e) => set({ householdName: e.target.value })}
                    className={big}
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
            <Button type="submit" variant="primary" disabled={busy} className={big}>
              {t(`auth.submit.${mode}`)}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
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
        </div>
      </section>
    </main>
  );
}

/** A mosaic of ingredient tiles, the same rounded tiles the recipe list uses: the only picture on the sign-in page. */
const TILES = [
  { id: 'Carrot', Icon: Carrot, tone: 'bg-accent text-accent-ink', lift: '' },
  { id: 'Fish', Icon: Fish, tone: 'bg-accent/20 text-accent-soft', lift: 'translate-y-5' },
  { id: 'Bread', Icon: Bread, tone: 'bg-warn/80 text-bg', lift: '' },
  { id: 'Leaf', Icon: Leaf, tone: 'bg-accent/20 text-accent-soft', lift: 'translate-y-5' },
  { id: 'Egg', Icon: Egg, tone: 'bg-ink/90 text-bg', lift: '' },
  { id: 'Pepper', Icon: Pepper, tone: 'bg-accent/45 text-ink', lift: 'translate-y-5' },
] as const;

function Harvest() {
  return (
    <div aria-hidden="true" className="mb-8 grid w-fit grid-cols-3 gap-3 pb-5 lg:gap-4">
      {TILES.map(({ id, Icon, tone, lift }) => (
        <div key={id} className={`grid size-16 place-items-center rounded-2xl lg:size-24 ${tone} ${lift}`}>
          <Icon weight="duotone" className="size-8 lg:size-12" />
        </div>
      ))}
    </div>
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
